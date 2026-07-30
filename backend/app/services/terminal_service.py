"""Terminal service: owns lifecycle for one interactive-shell Docker session per
browser tab.

Each WebSocket connection to /ws/terminal/{projectId} gets its own long-lived
container (`hdl-term-{session_id}`) with a real bash TTY attached via
`DockerService.open_shell`. Containers are isolated by name -- one tab's
session can never see or signal another tab's container process -- but as of
the terminal-persistence feature, every session's working dir is the *same*
named Docker volume (`settings.terminal_volume_name`), not each container's
own writable layer. That's deliberate: the container is disposable compute
(freely reaped on idle), the volume is the durable bit, and concurrently open
tabs on the same project sharing one live filesystem is intentional (matches
multiple terminal windows on one real machine), not an isolation regression.

Integration points:
  - `mirror_artifacts` is called (best-effort, never raising) from
    ExecutionService after a run finishes, so a project's terminal sessions
    pick up the same waveform/build output the Run pipeline just produced.
  - `sync_and_reset_workspace` is called from POST /api/v1/terminal/reset-workspace
    whenever the frontend switches to different project content (see
    explorerStore.ts's openCloudProject/openFolderFromFiles/loadWorkspaceSnapshot):
    it closes every live session, reads back whatever's on the volume,
    reconciles it against the tracked project tree (see its own docstring for
    the sync rules), then deletes the volume so the next project starts from
    a clean slate -- this is what keeps a single, bounded amount of terminal
    scratch data on disk instead of it accumulating across every project
    ever opened.
"""

import asyncio
import hashlib
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.config import get_settings
from app.schemas.run import HdlFile
from app.services.docker_service import DockerService
from app.utils.exceptions import DockerExecutionError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_READ_CHUNK = 4096
_WAVEFORM_POLL_INTERVAL = 2  # seconds
_FILE_POLL_INTERVAL = 3  # seconds


@dataclass
class TerminalSession:
    """One tab's live terminal: its container, exec socket, and output queue."""

    session_id: str
    project_id: str
    container: Any
    exec_id: str
    sock: Any
    queue: "asyncio.Queue[dict[str, Any]]"
    last_activity: float = field(default_factory=time.monotonic)
    closed: bool = False
    # Latest .vcd/.fst seen in the container (whether produced by a manual
    # `iverilog`/`vvp` in this terminal or mirrored in from a Run) and a hash
    # of its content, so the poller only notifies the client when it changes.
    waveform_filename: str | None = None
    waveform_bytes: bytes | None = None
    waveform_hash: str | None = None


@dataclass
class SyncResult:
    """Outcome of `sync_and_reset_workspace`, returned to the frontend."""

    synced: list[tuple[str, str]] = field(default_factory=list)  # (path, content) to merge in
    skipped_conflicts: list[str] = field(default_factory=list)  # changed both places -- editor kept as-is


class TerminalService:
    """Creates, streams, resizes, and tears down terminal sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, TerminalSession] = {}
        self._project_sessions: dict[str, set[str]] = {}
        self._reaper_task: asyncio.Task | None = None
        self._waveform_poll_task: asyncio.Task | None = None
        self._file_poll_task: asyncio.Task | None = None

        settings = get_settings()
        self._docker_service = DockerService(
            image=settings.docker_image,
            workdir=settings.docker_workdir,
            exec_timeout=settings.docker_exec_timeout,
        )
        self._idle_timeout = settings.terminal_idle_timeout
        self._volume_name = settings.terminal_volume_name

        # Baseline for `sync_and_reset_workspace`'s diff -- "what the app
        # itself last wrote" for the volume's *current* project, so shell
        # activity can be told apart from the app's own seeding. Cleared
        # every time the volume is reset (a new project starts a fresh
        # baseline). `_excluded_paths` are app-written paths that should
        # never be synced back regardless of whether they changed --
        # currently just `mirror_artifacts` output (waveforms/build
        # byproducts), which don't belong in the tracked source tree.
        self._seeded_hashes: dict[str, str] = {}
        self._excluded_paths: set[str] = set()

    async def open_session(
        self, project_id: str, files: list[HdlFile], cols: int, rows: int
    ) -> TerminalSession:
        """Create an isolated container, seed it with `files`, and attach a shell.

        Raises DockerExecutionError on failure (the container, if created, is
        cleaned up before re-raising).
        """

        self._ensure_background_tasks_running()

        session_id = uuid.uuid4().hex
        container = await asyncio.to_thread(
            self._docker_service.create_terminal_container, session_id, self._volume_name
        )

        try:
            for hdl_file in files:
                await asyncio.to_thread(
                    self._docker_service.write_bytes,
                    container,
                    hdl_file.name,
                    hdl_file.content.encode("utf-8"),
                )
                # Record what the app itself just wrote -- sync_and_reset_workspace's
                # baseline for telling a shell-made edit apart from this seed.
                self._seeded_hashes[hdl_file.name] = hashlib.sha256(hdl_file.content.encode("utf-8")).hexdigest()
            exec_id, sock = await asyncio.to_thread(self._docker_service.open_shell, container, cols, rows)
        except DockerExecutionError:
            await asyncio.to_thread(self._docker_service.destroy_container, container)
            raise

        session = TerminalSession(
            session_id=session_id,
            project_id=project_id,
            container=container,
            exec_id=exec_id,
            sock=sock,
            queue=asyncio.Queue(),
        )
        self._sessions[session_id] = session
        self._project_sessions.setdefault(project_id, set()).add(session_id)

        loop = asyncio.get_running_loop()
        thread = threading.Thread(
            target=self._pump_output,
            args=(session, loop),
            daemon=True,
            name=f"terminal-reader-{session_id}",
        )
        thread.start()

        logger.info("Terminal session %s opened for project=%s", session_id, project_id)
        return session

    def _pump_output(self, session: TerminalSession, loop: asyncio.AbstractEventLoop) -> None:
        """Runs on a dedicated thread: blocking-reads the exec socket and hands
        each chunk back to the event loop. Never raises into the caller -- any
        socket error just ends the pump, same as a normal shell exit."""

        try:
            while True:
                try:
                    chunk = session.sock.recv(_READ_CHUNK)
                except OSError:
                    break
                if not chunk:
                    break
                text = chunk.decode("utf-8", errors="replace")
                loop.call_soon_threadsafe(session.queue.put_nowait, {"type": "output", "data": text})
        finally:
            loop.call_soon_threadsafe(session.queue.put_nowait, {"type": "exit"})

    async def send_input(self, session_id: str, data: str) -> None:
        """Write keystrokes/pasted text to the shell's stdin."""

        session = self._sessions.get(session_id)
        if session is None or session.closed:
            return
        session.last_activity = time.monotonic()
        try:
            await asyncio.to_thread(session.sock.sendall, data.encode("utf-8"))
        except OSError as exc:
            logger.warning("Terminal session %s: write failed: %s", session_id, exc)

    async def resize(self, session_id: str, cols: int, rows: int) -> None:
        """Propagate an xterm.js viewport resize to the shell's pty."""

        session = self._sessions.get(session_id)
        if session is None or session.closed:
            return
        session.last_activity = time.monotonic()
        await asyncio.to_thread(self._docker_service.resize_exec, session.exec_id, cols, rows)

    async def read_output(self, session_id: str):
        """Async generator yielding {"type": "output"|"exit", ...} messages until
        the shell exits or the session is closed."""

        session = self._sessions.get(session_id)
        if session is None:
            return
        while True:
            message = await session.queue.get()
            yield message
            if message["type"] == "exit":
                return

    async def close_session(self, session_id: str) -> None:
        """Tear down a session: close the socket and destroy its container."""

        session = self._sessions.pop(session_id, None)
        if session is None:
            return
        session.closed = True
        self._project_sessions.get(session.project_id, set()).discard(session_id)
        try:
            session.sock.close()
        except OSError:
            pass
        await asyncio.to_thread(self._docker_service.destroy_container, session.container)
        logger.info("Terminal session %s closed", session_id)

    def get_waveform(self, session_id: str) -> tuple[str, bytes] | None:
        """Return (filename, bytes) for this session's latest detected
        waveform, or None if it hasn't produced one yet."""

        session = self._sessions.get(session_id)
        if session is None or session.waveform_filename is None or session.waveform_bytes is None:
            return None
        return session.waveform_filename, session.waveform_bytes

    def has_sessions(self, project_id: str) -> bool:
        """Cheap in-memory check so callers can skip work when nobody's listening."""

        return bool(self._project_sessions.get(project_id))

    async def mirror_artifacts(self, project_id: str, files: dict[str, bytes]) -> None:
        """Best-effort: copy a finished job's output into every live terminal
        session for this project. Never raises -- callers rely on that."""

        for session_id in list(self._project_sessions.get(project_id, set())):
            session = self._sessions.get(session_id)
            if session is None or session.closed:
                continue
            for filename, data in files.items():
                try:
                    await asyncio.to_thread(self._docker_service.write_bytes, session.container, filename, data)
                    # Run output (waveforms, build byproducts), not something a
                    # user wrote by hand -- never eligible for sync-back into
                    # the tracked project tree, regardless of whether it later
                    # looks "changed" relative to any baseline.
                    self._excluded_paths.add(filename)
                except DockerExecutionError as exc:
                    logger.warning(
                        "Failed to mirror '%s' into terminal session %s: %s", filename, session_id, exc
                    )

    async def sync_and_reset_workspace(self, tracked_files: dict[str, str]) -> SyncResult:
        """Called when the frontend switches to different project content.

        Closes every live terminal session (so nothing still has the volume
        mounted), reads back whatever's currently on it, reconciles that
        against `tracked_files` (the *current* editor/explorer tree for the
        project about to be left), then deletes the volume so the next
        project starts from a clean slate.

        Reconciliation, per path found on the volume:
          - Unchanged since this app last wrote it (`_seeded_hashes`) -> skip.
          - In `_excluded_paths` (mirrored run output) -> skip, always.
          - Not decodable as UTF-8 text -> skip (nothing to fold into a
            text-based project tree).
          - Otherwise it's a real shell-made change. If `tracked_files` still
            has the *original* seeded content for that path (i.e. the editor
            never touched it either), no conflict -- include it. If
            `tracked_files` already diverges from the seeded baseline (edited
            in the app too), that's a genuine conflict -- the editor's copy
            wins by doing nothing; the path is reported in `skipped_conflicts`
            but not synced.
          - A path that existed in `_seeded_hashes` but is simply absent from
            the extracted volume (deleted in the shell) is not reported at
            all -- deletions are never propagated back into the tracked tree.
        """

        for session_id in list(self._sessions.keys()):
            await self.close_session(session_id)

        extracted = await asyncio.to_thread(self._docker_service.extract_volume_contents, self._volume_name)

        result = SyncResult()
        for path, raw_bytes in extracted.items():
            if path in self._excluded_paths:
                continue
            try:
                content = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                continue

            current_hash = hashlib.sha256(raw_bytes).hexdigest()
            baseline_hash = self._seeded_hashes.get(path)
            if current_hash == baseline_hash:
                continue  # untouched since the app last seeded it

            tracked_content = tracked_files.get(path)
            if tracked_content is not None:
                tracked_hash = hashlib.sha256(tracked_content.encode("utf-8")).hexdigest()
                if tracked_hash != baseline_hash:
                    result.skipped_conflicts.append(path)
                    continue  # editor changed it too -- don't clobber unsaved editor work

            result.synced.append((path, content))

        await asyncio.to_thread(self._docker_service.reset_volume, self._volume_name)
        self._seeded_hashes.clear()
        self._excluded_paths.clear()

        logger.info(
            "Terminal workspace reset: %d file(s) synced back, %d conflict(s) skipped",
            len(result.synced),
            len(result.skipped_conflicts),
        )
        return result

    async def _poll_terminal_files(self) -> None:
        """Notices new files a live terminal session's shell created (`touch`,
        a generated log, a cloned dependency, ...) and pushes them to every
        open tab so they show up in the Explorer within a few seconds --
        without this, a file only ever became visible once you switched
        projects and triggered sync_and_reset_workspace.

        Deliberately reports only genuinely *new* paths -- never anything
        already in `_seeded_hashes` (a tracked file that changed). This
        poller runs with no request context, so unlike sync_and_reset_workspace
        it has no way to check the frontend's current tracked content for an
        edit-vs-edit conflict; reporting only brand-new paths means there's
        nothing to conflict with in the first place. Modifications to
        already-tracked files still reconcile correctly, just at switch time.
        """

        while True:
            await asyncio.sleep(_FILE_POLL_INTERVAL)
            session = next((s for s in self._sessions.values() if not s.closed), None)
            if session is None:
                continue

            try:
                extracted = await asyncio.to_thread(self._docker_service.read_container_contents, session.container)
            except DockerExecutionError:
                continue  # container likely mid-teardown -- retry next tick

            new_files: list[tuple[str, str]] = []
            for path, raw_bytes in extracted.items():
                if path in self._excluded_paths or path in self._seeded_hashes:
                    continue
                try:
                    content = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                new_files.append((path, content))
                # Recognizing it here is equivalent to seeding it -- keeps
                # sync_and_reset_workspace's later diff from either
                # re-reporting it or, worse, treating the frontend's now-
                # up-to-date copy as a conflict against a stale/absent
                # baseline.
                self._seeded_hashes[path] = hashlib.sha256(raw_bytes).hexdigest()

            if not new_files:
                continue

            message = {
                "type": "files_changed",
                "files": [{"path": path, "content": content} for path, content in new_files],
            }
            for live_session in self._sessions.values():
                if not live_session.closed:
                    live_session.queue.put_nowait(message)

    def _ensure_background_tasks_running(self) -> None:
        if self._reaper_task is None or self._reaper_task.done():
            self._reaper_task = asyncio.create_task(self._reap_idle_sessions())
        if self._waveform_poll_task is None or self._waveform_poll_task.done():
            self._waveform_poll_task = asyncio.create_task(self._poll_waveforms())
        if self._file_poll_task is None or self._file_poll_task.done():
            self._file_poll_task = asyncio.create_task(self._poll_terminal_files())

    async def _reap_idle_sessions(self) -> None:
        """Safety net for sessions that never got a clean WS close (e.g. the
        client's network dropped) so containers don't accumulate forever."""

        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            idle_ids = [
                sid for sid, session in list(self._sessions.items()) if now - session.last_activity > self._idle_timeout
            ]
            for sid in idle_ids:
                logger.info("Reaping idle terminal session %s", sid)
                await self.close_session(sid)

    async def _poll_waveforms(self) -> None:
        """Notices .vcd/.fst files a terminal session's own shell produced
        (e.g. the user ran `iverilog`/`vvp` by hand, not via the Run button)
        and pushes a "waveform" message so the frontend can display it --
        without this, only Run-button waveforms would ever reach the viewer."""

        while True:
            await asyncio.sleep(_WAVEFORM_POLL_INTERVAL)
            for session in list(self._sessions.values()):
                if session.closed:
                    continue
                try:
                    name = await asyncio.to_thread(self._docker_service.find_waveform_file, session.container)
                    if not name:
                        continue
                    data = await asyncio.to_thread(self._docker_service.extract_file, session.container, name)
                    if data is None:
                        continue
                    digest = hashlib.md5(data).hexdigest()
                    if name == session.waveform_filename and digest == session.waveform_hash:
                        continue  # unchanged since last check
                    session.waveform_filename = name
                    session.waveform_bytes = data
                    session.waveform_hash = digest
                    session.queue.put_nowait({"type": "waveform", "filename": name})
                except DockerExecutionError:
                    continue  # container likely being torn down mid-tick; retry next cycle


terminal_service = TerminalService()


def get_terminal_service() -> TerminalService:
    """FastAPI dependency provider for TerminalService."""

    return terminal_service
