"""Message schemas for the WS /ws/terminal/{projectId} protocol.

Client -> server: exactly one "init" message first, then any number of
"input"/"resize" messages. Server -> client: "ready", "output", "error", "exit".
"""

from typing import Literal

from pydantic import BaseModel

from app.schemas.run import HdlFile


class TerminalInitMessage(BaseModel):
    """First message a client must send after the socket opens."""

    type: Literal["init"] = "init"
    files: list[HdlFile] = []
    cols: int = 80
    rows: int = 24


class TerminalInputMessage(BaseModel):
    """Raw keystrokes/pasted text to write to the shell's stdin."""

    type: Literal["input"] = "input"
    data: str


class TerminalResizeMessage(BaseModel):
    """Emitted when the xterm.js viewport is resized (e.g. window resize)."""

    type: Literal["resize"] = "resize"
    cols: int
    rows: int


class TerminalResetWorkspaceRequest(BaseModel):
    """Body for POST /api/v1/terminal/reset-workspace -- the current
    project's tracked files, keyed by workspace-relative path (same shape
    the frontend already sends as `/workspace/open`'s `files`, just as a
    dict instead of a list), used to detect shell-vs-editor conflicts."""

    trackedFiles: dict[str, str] = {}


class SyncedFile(BaseModel):
    """One file the terminal's shell changed, safe to fold back into the
    tracked project tree (see TerminalService.sync_and_reset_workspace)."""

    path: str
    content: str


class TerminalResetWorkspaceResponse(BaseModel):
    """Response for POST /api/v1/terminal/reset-workspace."""

    synced: list[SyncedFile] = []
    skippedConflicts: list[str] = []
