"""One project's svlangserver process: a plain OS subprocess speaking LSP
stdio framing (see `app/utils/lsp_framing.py`) over its stdin/stdout.

Never shared between projects (see `app/lsp/manager.py`). Multiple WebSocket
clients for the *same* project (e.g. two browser tabs) can attach to one
process via `subscribe`/`unsubscribe` -- svlangserver itself has no notion of
"clients", it just sees one stdio stream, so every subscriber sees every
message the server emits.
"""

import asyncio
import time
from typing import Any

from app.utils.exceptions import LspProcessError
from app.utils.lsp_framing import encode_message, read_message
from app.utils.logger import get_logger

logger = get_logger(__name__)

_TERMINATE_GRACE_SECONDS = 5


class LspProcess:
    """Owns one svlangserver subprocess for one project's workspace directory."""

    def __init__(self, project_id: str, cwd: str, command: str) -> None:
        self.project_id = project_id
        self.cwd = cwd
        self.last_activity = time.monotonic()

        self._command = command
        self._proc: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task | None = None
        self._stderr_task: asyncio.Task | None = None
        self._subscribers: set[asyncio.Queue] = set()

    def is_alive(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    async def start(self) -> None:
        if self.is_alive():
            return
        try:
            self._proc = await asyncio.create_subprocess_exec(
                self._command,
                cwd=self.cwd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (OSError, FileNotFoundError) as exc:
            raise LspProcessError(f"Failed to start svlangserver for project '{self.project_id}': {exc}") from exc

        self.last_activity = time.monotonic()
        self._reader_task = asyncio.create_task(self._pump_stdout())
        self._stderr_task = asyncio.create_task(self._pump_stderr())
        logger.info("svlangserver started for project=%s pid=%s", self.project_id, self._proc.pid)

    async def send(self, message: dict[str, Any]) -> None:
        if not self.is_alive() or self._proc is None or self._proc.stdin is None:
            raise LspProcessError(f"svlangserver for project '{self.project_id}' is not running")
        self.last_activity = time.monotonic()
        self._proc.stdin.write(encode_message(message))
        await self._proc.stdin.drain()

    def subscribe(self) -> "asyncio.Queue[dict[str, Any] | None]":
        """Register a new listener; it receives every message svlangserver
        emits from now on, plus a final `None` sentinel if the process exits."""

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: "asyncio.Queue[dict[str, Any] | None]") -> None:
        self._subscribers.discard(queue)

    async def stop(self) -> None:
        for task in (self._reader_task, self._stderr_task):
            if task is not None:
                task.cancel()
        self._reader_task = None
        self._stderr_task = None

        if self._proc is not None and self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=_TERMINATE_GRACE_SECONDS)
            except asyncio.TimeoutError:
                self._proc.kill()
                await self._proc.wait()
        logger.info("svlangserver stopped for project=%s", self.project_id)
        self._proc = None

    async def restart(self) -> None:
        await self.stop()
        await self.start()

    async def _pump_stdout(self) -> None:
        assert self._proc is not None and self._proc.stdout is not None
        try:
            while True:
                message = await read_message(self._proc.stdout)
                if message is None:
                    break
                self.last_activity = time.monotonic()
                for queue in list(self._subscribers):
                    queue.put_nowait(message)
        except (asyncio.IncompleteReadError, ValueError) as exc:
            logger.warning("svlangserver[%s] stdout stream ended: %s", self.project_id, exc)
        finally:
            for queue in list(self._subscribers):
                queue.put_nowait(None)

    async def _pump_stderr(self) -> None:
        assert self._proc is not None and self._proc.stderr is not None
        while True:
            line = await self._proc.stderr.readline()
            if not line:
                break
            logger.debug("svlangserver[%s] stderr: %s", self.project_id, line.decode(errors="replace").rstrip())
