"""Docker service: owns container lifecycle for HDL compile/simulate steps.

Uses the Docker SDK for Python (never subprocess). The SDK client is
synchronous, so every call is pushed through `asyncio.to_thread` to keep the
FastAPI event loop free.

MVP scope: one fresh container per run request, no pooling/queueing.
"""

import io
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import docker
from docker.errors import APIError, DockerException, NotFound
from docker.models.containers import Container

from app.schemas.run import HdlFile
from app.utils.exceptions import DockerExecutionError
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str


class DockerService:
    """Creates a fresh container per job and executes commands in it.

    Deliberately has no knowledge of any HDL toolchain -- `compile`/`run`
    command strings are built by a `SimulatorAdapter`
    (`app/services/simulators/`) and handed to `run_command` as opaque
    text; this class only knows how to create/seed/exec/destroy containers.
    """

    def __init__(self, image: str, workdir: str, exec_timeout: int, mem_limit: str = "256m") -> None:
        self._image = image
        self._workdir = workdir
        self.exec_timeout = exec_timeout
        self._mem_limit = mem_limit
        self._client: docker.DockerClient | None = None

    def _client_or_raise(self) -> docker.DockerClient:
        if self._client is None:
            try:
                self._client = docker.from_env()
            except DockerException as exc:
                raise DockerExecutionError(f"Cannot reach Docker daemon: {exc}") from exc
        return self._client

    def ping(self) -> None:
        """Preflight check: raises DockerExecutionError if the daemon is unreachable."""

        try:
            self._client_or_raise().ping()
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Cannot reach Docker daemon: {exc}") from exc

    # -- container lifecycle -------------------------------------------------

    def create_container(self, job_id: str) -> Container:
        """Start a fresh, idle container for this job (blocking; run via to_thread)."""

        client = self._client_or_raise()
        try:
            container = client.containers.run(
                self._image,
                command="sleep infinity",
                detach=True,
                name=f"hdl-run-{job_id}",
                working_dir=self._workdir,
                mem_limit=self._mem_limit,
                network_disabled=True,
            )
        except NotFound as exc:
            raise DockerExecutionError(
                f"Docker image '{self._image}' not found. Build it first (see backend/docker/README)."
            ) from exc
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to create container: {exc}") from exc

        logger.info("Container %s created for job %s", container.short_id, job_id)
        return container

    def create_terminal_container(self, session_id: str, volume_name: str) -> Container:
        """Start a long-lived, idle container backing one browser tab's terminal.

        Same image/hardening as the per-job run container, isolated by name so
        one tab's session can never see or signal another tab's container --
        but `working_dir` is a named Docker volume (Docker auto-creates it,
        empty, on first use if it doesn't exist yet), not the container's own
        writable layer: destroying this container later (idle reap or a clean
        tab close) never touches anything written there. See
        `extract_volume_contents`/`reset_volume` for how that volume itself
        eventually gets read back and reclaimed.
        """

        client = self._client_or_raise()
        try:
            container = client.containers.run(
                self._image,
                command="sleep infinity",
                detach=True,
                name=f"hdl-term-{session_id}",
                working_dir=self._workdir,
                volumes={volume_name: {"bind": self._workdir, "mode": "rw"}},
                mem_limit="256m",
                network_disabled=True,
                pids_limit=128,
            )
        except NotFound as exc:
            raise DockerExecutionError(
                f"Docker image '{self._image}' not found. Build it first (see backend/docker/README)."
            ) from exc
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to create terminal container: {exc}") from exc

        logger.info("Terminal container %s created for session %s", container.short_id, session_id)
        return container

    def _read_workdir_archive(self, container: Container) -> dict[str, bytes]:
        """Shared by `extract_volume_contents` and `read_container_contents`:
        tars up `container`'s working dir via `get_archive` and unpacks it
        into `{relative_path: bytes}`. Returns {} if the path doesn't exist
        (nothing written there yet)."""

        try:
            bits, _stat = container.get_archive(self._workdir)
        except NotFound:
            return {}
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to read '{self._workdir}' from container: {exc}") from exc

        tar_stream = io.BytesIO()
        for chunk in bits:
            tar_stream.write(chunk)
        tar_stream.seek(0)

        files: dict[str, bytes] = {}
        with tarfile.open(fileobj=tar_stream) as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                # get_archive(self._workdir) prefixes every entry with the
                # working dir's own basename, e.g. "workspace/rtl/top.v".
                _prefix, _sep, relative = member.name.partition("/")
                if not relative:
                    continue
                extracted = tar.extractfile(member)
                if extracted is not None:
                    files[relative] = extracted.read()
        return files

    def read_container_contents(self, container: Container) -> dict[str, bytes]:
        """Non-destructive read of every file in an *already-running*
        container's working dir -- for polling a live terminal session for
        shell-made changes without touching its container or volume at all
        (unlike `extract_volume_contents`, which is the destructive
        close-everything-then-read path used right before a volume reset)."""

        return self._read_workdir_archive(container)

    def extract_volume_contents(self, volume_name: str) -> dict[str, bytes]:
        """Reads every file currently on `volume_name`, keyed by path relative
        to the working dir (e.g. "rtl/top.v"). Spins up a short-lived,
        read-only helper container to do the reading through -- callers are
        expected to have already closed every real session mounting this
        volume, so there's no concurrent-write risk, but this doesn't itself
        require that (a stale read is at worst a slightly-out-of-date sync).
        Returns {} if the volume doesn't exist (nothing was ever written)."""

        client = self._client_or_raise()
        helper: Container | None = None
        try:
            try:
                helper = client.containers.run(
                    self._image,
                    command="sleep infinity",
                    detach=True,
                    working_dir=self._workdir,
                    volumes={volume_name: {"bind": self._workdir, "mode": "ro"}},
                    mem_limit="128m",
                    network_disabled=True,
                )
            except (APIError, DockerException) as exc:
                raise DockerExecutionError(f"Failed to mount terminal volume '{volume_name}': {exc}") from exc

            return self._read_workdir_archive(helper)
        finally:
            if helper is not None:
                self.destroy_container(helper)

    def reset_volume(self, volume_name: str) -> None:
        """Deletes a named volume outright (Docker recreates it, empty, next
        time a container mounts that name) -- callers must ensure no container
        currently mounts it first, or removal fails and is swallowed here.
        Best-effort, same as `destroy_container`: never raises."""

        client = self._client_or_raise()
        try:
            client.volumes.get(volume_name).remove(force=True)
            logger.info("Terminal volume %s reset", volume_name)
        except NotFound:
            pass  # already gone / never created -- nothing to do
        except (APIError, DockerException) as exc:
            logger.warning("Failed to reset terminal volume %s: %s", volume_name, exc)

    def destroy_container(self, container: Container) -> None:
        """Force-remove a container. Best-effort: swallow errors, just log them."""

        try:
            container.remove(force=True)
            logger.info("Container %s destroyed", container.short_id)
        except NotFound:
            pass
        except (APIError, DockerException) as exc:
            logger.warning("Failed to destroy container %s: %s", container.short_id, exc)

    # -- file transfer ---------------------------------------------------------

    def copy_files(self, container: Container, files: list[HdlFile]) -> None:
        """Write the received files to a temp dir on the host, then copy them into
        the container workdir. The temp dir is always removed before returning,
        whether or not the copy succeeds."""

        with tempfile.TemporaryDirectory(prefix="hdl-webide-") as tmp_dir:
            tmp_path = Path(tmp_dir)
            for hdl_file in files:
                (tmp_path / hdl_file.name).write_text(hdl_file.content, encoding="utf-8")

            tar_stream = io.BytesIO()
            with tarfile.open(fileobj=tar_stream, mode="w") as tar:
                for hdl_file in files:
                    tar.add(tmp_path / hdl_file.name, arcname=hdl_file.name)
            tar_stream.seek(0)

            try:
                container.put_archive(self._workdir, tar_stream)
            except (APIError, DockerException) as exc:
                raise DockerExecutionError(f"Failed to copy files into container: {exc}") from exc
        # `tempfile.TemporaryDirectory` removes tmp_dir (and the files in it) here.

    def copy_workspace_files(self, container: Container, files: list[tuple[str, str]]) -> None:
        """Like `copy_files`, but for an arbitrary, nested directory structure --
        each entry is `(relative_path, content)`, e.g. `("rtl/alu.v", "...")`.
        Used by the execution-payload run pipeline, which reconstructs a full
        multi-folder project rather than a flat two-file design/testbench pair.
        """

        with tempfile.TemporaryDirectory(prefix="hdl-webide-") as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            written: list[str] = []

            for relative_path, content in files:
                target = (tmp_path / relative_path).resolve()
                if tmp_path not in target.parents and target != tmp_path:
                    raise DockerExecutionError(f"Refusing to write file outside workspace: '{relative_path}'")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
                written.append(relative_path)

            tar_stream = io.BytesIO()
            with tarfile.open(fileobj=tar_stream, mode="w") as tar:
                for relative_path in written:
                    tar.add(tmp_path / relative_path, arcname=relative_path)
            tar_stream.seek(0)

            try:
                container.put_archive(self._workdir, tar_stream)
            except (APIError, DockerException) as exc:
                raise DockerExecutionError(f"Failed to copy workspace files into container: {exc}") from exc

    def write_bytes(self, container: Container, filename: str, data: bytes) -> None:
        """Write a single file's raw bytes into the container workdir.

        Used to seed a terminal container with the current editor contents and
        to mirror a finished job's waveform/build artifacts into it -- distinct
        from `copy_files` (which is part of the run pipeline) so that path is
        never touched by the terminal feature.
        """

        tar_stream = io.BytesIO()
        with tarfile.open(fileobj=tar_stream, mode="w") as tar:
            info = tarfile.TarInfo(name=filename)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        tar_stream.seek(0)

        try:
            container.put_archive(self._workdir, tar_stream)
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to write '{filename}' into container: {exc}") from exc

    def extract_file(self, container: Container, filename: str) -> bytes | None:
        """Read a file back out of the container, or None if it doesn't exist."""

        try:
            bits, _stat = container.get_archive(f"{self._workdir}/{filename}")
        except NotFound:
            return None
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to extract '{filename}' from container: {exc}") from exc

        tar_stream = io.BytesIO()
        for chunk in bits:
            tar_stream.write(chunk)
        tar_stream.seek(0)

        with tarfile.open(fileobj=tar_stream) as tar:
            member = tar.getmember(filename)
            extracted = tar.extractfile(member)
            return extracted.read() if extracted else None

    # -- compile / simulate ------------------------------------------------

    def run_command(self, container: Container, command: str) -> ExecResult:
        """Executes an arbitrary, dynamically-built command string inside
        `container`. This is the *only* compile/run entry point -- every
        engine-specific command (iverilog, verilator, ...) is built by a
        `SimulatorAdapter` (see `app/services/simulators/`) and handed here
        as opaque text; this class never branches on which engine it is."""

        return self._exec(container, command)

    def find_waveform_file(self, container: Container) -> str | None:
        """Look for whatever .vcd/.fst file the testbench actually produced.

        Testbenches choose their own $dumpfile(...) name, so this globs for any
        .vcd/.fst in the workdir rather than guessing fixed filenames.
        """

        result = self._exec(container, ["sh", "-c", "ls -1 *.vcd *.fst 2>/dev/null | head -n1"])
        filename = result.stdout.strip()
        return filename or None

    def _exec(self, container: Container, command: str | list[str]) -> ExecResult:
        try:
            exit_code, (stdout_bytes, stderr_bytes) = container.exec_run(
                command,
                workdir=self._workdir,
                demux=True,
            )
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Command '{command}' failed to execute: {exc}") from exc

        stdout = (stdout_bytes or b"").decode("utf-8", errors="replace")
        stderr = (stderr_bytes or b"").decode("utf-8", errors="replace")
        return ExecResult(exit_code=exit_code, stdout=stdout, stderr=stderr)

    def kill_container(self, container: Container) -> None:
        """Forcefully stop a container mid-execution (used by /stop)."""

        try:
            container.kill()
        except NotFound:
            pass
        except (APIError, DockerException) as exc:
            logger.warning("Failed to kill container %s: %s", container.short_id, exc)

    # -- interactive terminal ------------------------------------------------

    def open_shell(self, container: Container, cols: int, rows: int) -> tuple[str, Any]:
        """Start an interactive `bash` inside `container` with a real TTY attached.

        Returns `(exec_id, socket)`. `socket` is a raw duplex socket (`.sendall`/
        `.recv`) wired to the shell's stdin/stdout/stderr. Because a real TTY is
        allocated, bash's own line discipline handles Ctrl+C (SIGINT), Ctrl+L,
        and Up/Down history -- none of that needs reimplementing here.
        """

        client = self._client_or_raise()
        try:
            exec_id = client.api.exec_create(
                container.id,
                cmd=["/bin/bash", "--norc", "--noprofile"],
                stdin=True,
                stdout=True,
                stderr=True,
                tty=True,
                workdir=self._workdir,
                environment={
                    "TERM": "xterm-256color",
                    "PS1": r"\[\e[32m\]root@webide\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]$ ",
                },
            )["Id"]
            sock = client.api.exec_start(exec_id, tty=True, socket=True)
        except (APIError, DockerException) as exc:
            raise DockerExecutionError(f"Failed to start terminal shell: {exc}") from exc

        # The SDK's return type depends on the daemon transport: a raw socket
        # object (with recv/sendall) over Windows named pipes, but a
        # `socket.SocketIO` file-like wrapper over Unix sockets (e.g. when this
        # backend runs inside its Docker image with /var/run/docker.sock
        # mounted). Unwrap to the underlying raw socket so TerminalService can
        # use recv/sendall on either platform.
        sock = getattr(sock, "_sock", sock)

        self.resize_exec(exec_id, cols, rows)
        return exec_id, sock

    def resize_exec(self, exec_id: str, cols: int, rows: int) -> None:
        """Propagate an xterm.js viewport resize to the shell's pty."""

        try:
            self._client_or_raise().api.exec_resize(exec_id, height=max(rows, 1), width=max(cols, 1))
        except (APIError, DockerException) as exc:
            logger.warning("Failed to resize exec %s: %s", exec_id, exc)
