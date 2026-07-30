"""Workspace Manager: owns each open project's real on-disk directory.

Unlike the execution/terminal pipelines (which only ever materialize files
inside ephemeral Docker containers), svlangserver/Verilator/Verible/Surelog
are external processes that need a real, addressable directory on the
backend's own filesystem -- this is the one place that creates, writes to,
and tears down those directories, under `settings.lsp_workspace_root`.

Fully synchronous (plain `pathlib` I/O) -- callers push it through
`asyncio.to_thread`, mirroring how `DockerService` (also sync) is used
elsewhere in this codebase.
"""

import shutil
from pathlib import Path

from app.models.workspace import WorkspaceSession
from app.utils.exceptions import InvalidWorkspacePathError, WorkspaceNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_VERILOG_EXTENSIONS = {".v", ".sv", ".svh", ".vh"}


class WorkspaceManager:
    """Creates, opens, writes to, and deletes per-project workspace directories."""

    def __init__(self, root: str) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, WorkspaceSession] = {}

    def _project_root(self, project_id: str) -> Path:
        """`project_id` becomes a directory name -- reject anything that
        could traverse outside `lsp_workspace_root`."""

        if not project_id or project_id in (".", "..") or "/" in project_id or "\\" in project_id:
            raise InvalidWorkspacePathError(project_id)
        return self._root / project_id

    def ensure_open(self, project_id: str) -> WorkspaceSession:
        """Create the workspace directory if needed and return its session,
        creating a fresh session record either way. Used internally by the
        LSP/diagnostics/formatter/indexer services so they always have a
        real directory to work against."""

        path = self._project_root(project_id)
        path.mkdir(parents=True, exist_ok=True)
        session = self._sessions.get(project_id)
        if session is None:
            session = WorkspaceSession(project_id=project_id, path=path)
            self._sessions[project_id] = session
            logger.info("Workspace opened for project=%s at %s", project_id, path)
        else:
            session.touch()
        return session

    def open(self, project_id: str) -> WorkspaceSession:
        """Like `ensure_open`, but fails if the project has never been created."""

        path = self._project_root(project_id)
        if not path.is_dir():
            raise WorkspaceNotFoundError(project_id)
        return self.ensure_open(project_id)

    def resolve_path(self, project_id: str, relative_path: str) -> Path:
        """Resolve a workspace-relative path, raising if it would escape the
        workspace root (e.g. '../../etc/passwd')."""

        session = self.ensure_open(project_id)
        root = session.path.resolve()
        candidate = (root / relative_path).resolve()
        if candidate != root and root not in candidate.parents:
            raise InvalidWorkspacePathError(relative_path)
        return candidate

    def write_file(self, project_id: str, relative_path: str, content: str) -> Path:
        target = self.resolve_path(project_id, relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def read_file(self, project_id: str, relative_path: str) -> str:
        target = self.resolve_path(project_id, relative_path)
        if not target.is_file():
            raise FileNotFoundError(relative_path)
        return target.read_text(encoding="utf-8")

    def save_files(self, project_id: str, files: list[tuple[str, str]]) -> list[str]:
        """Write a batch of (relative_path, content) pairs. Used by both
        POST /workspace/save and POST /workspace/open (initial seed)."""

        written: list[str] = []
        for relative_path, content in files:
            self.write_file(project_id, relative_path, content)
            written.append(relative_path)
        return written

    def delete_file(self, project_id: str, relative_path: str) -> None:
        target = self.resolve_path(project_id, relative_path)
        target.unlink(missing_ok=True)

    def list_verilog_files(self, project_id: str) -> list[Path]:
        """All .v/.sv/.svh/.vh files currently on disk for this project,
        used by the Verilator and Surelog services to build their file list."""

        session = self.ensure_open(project_id)
        return sorted(
            p for p in session.path.rglob("*") if p.is_file() and p.suffix.lower() in _VERILOG_EXTENSIONS
        )

    def delete(self, project_id: str) -> None:
        """Remove a project's workspace entirely (POST /workspace/delete)."""

        path = self._project_root(project_id)
        self._sessions.pop(project_id, None)
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        logger.info("Workspace deleted for project=%s", project_id)

    def get_session(self, project_id: str) -> WorkspaceSession | None:
        return self._sessions.get(project_id)

    def exists(self, project_id: str) -> bool:
        return self._project_root(project_id).is_dir()


_workspace_manager: WorkspaceManager | None = None


def get_workspace_manager() -> WorkspaceManager:
    """FastAPI dependency provider -- module-level singleton, same pattern as
    `terminal_service` in `app/services/terminal_service.py`."""

    global _workspace_manager
    if _workspace_manager is None:
        from app.config import get_settings

        _workspace_manager = WorkspaceManager(get_settings().lsp_workspace_root)
    return _workspace_manager
