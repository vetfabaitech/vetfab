"""LSP Process Manager: one `LspProcess` (svlangserver) per active project.

Responsible for starting, stopping, restarting, health-checking, and
idle-reaping svlangserver processes -- mirrors the lifecycle pattern
`TerminalService` already uses for terminal containers
(`app/services/terminal_service.py`), applied to plain subprocesses instead
of Docker containers.
"""

import asyncio
import time

from app.lsp.process import LspProcess
from app.utils.exceptions import LspProcessError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_REAPER_INTERVAL = 60  # seconds


class LspProcessManager:
    """Creates/reuses/tears down one svlangserver process per project id."""

    def __init__(self, command: str, idle_timeout: int) -> None:
        self._command = command
        self._idle_timeout = idle_timeout
        self._processes: dict[str, LspProcess] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._reaper_task: asyncio.Task | None = None

    async def get_or_start(self, project_id: str, cwd: str) -> LspProcess:
        """Return the running process for `project_id`, starting a fresh one
        if it doesn't exist or previously crashed. Serialized per-project so
        two concurrent connections never race to start two processes."""

        self._ensure_reaper()
        lock = self._locks.setdefault(project_id, asyncio.Lock())
        async with lock:
            process = self._processes.get(project_id)
            if process is None or not process.is_alive():
                process = LspProcess(project_id, cwd, self._command)
                await process.start()
                self._processes[project_id] = process
            return process

    async def stop(self, project_id: str) -> None:
        process = self._processes.pop(project_id, None)
        if process is not None:
            await process.stop()

    async def restart(self, project_id: str) -> LspProcess:
        process = self._processes.get(project_id)
        if process is None:
            raise LspProcessError(f"No svlangserver process is running for project '{project_id}'")
        await process.restart()
        return process

    def health(self, project_id: str) -> bool:
        process = self._processes.get(project_id)
        return process is not None and process.is_alive()

    def get(self, project_id: str) -> LspProcess | None:
        return self._processes.get(project_id)

    async def stop_all(self) -> None:
        """Called on app shutdown so no svlangserver processes are orphaned."""

        for project_id in list(self._processes.keys()):
            await self.stop(project_id)

    def _ensure_reaper(self) -> None:
        if self._reaper_task is None or self._reaper_task.done():
            self._reaper_task = asyncio.create_task(self._reap_idle())

    async def _reap_idle(self) -> None:
        while True:
            await asyncio.sleep(_REAPER_INTERVAL)
            now = time.monotonic()
            idle_ids = [
                pid for pid, process in list(self._processes.items())
                if now - process.last_activity > self._idle_timeout
            ]
            for project_id in idle_ids:
                logger.info("Reaping idle svlangserver for project=%s", project_id)
                await self.stop(project_id)


_lsp_manager: LspProcessManager | None = None


def get_lsp_manager() -> LspProcessManager:
    """FastAPI dependency provider -- module-level singleton."""

    global _lsp_manager
    if _lsp_manager is None:
        from app.config import get_settings

        settings = get_settings()
        _lsp_manager = LspProcessManager(settings.svlangserver_cmd, settings.lsp_idle_timeout)
    return _lsp_manager
