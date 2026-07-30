"""Request/response schemas for POST /lint."""

from pydantic import BaseModel, ConfigDict

from app.schemas.workspace import WorkspaceFile


class LintRequest(BaseModel):
    """`files` is the current editor-buffer state (written into the
    workspace before linting, so Verilator always sees what's on screen,
    not just the last explicit save)."""

    projectId: str
    files: list[WorkspaceFile]


class DiagnosticSchema(BaseModel):
    """Shaped so the frontend can pass `monacoSeverity` straight into
    `monaco.editor.setModelMarkers` without translating it."""

    model_config = ConfigDict(from_attributes=True)

    file: str
    line: int
    column: int
    message: str
    severity: str
    monacoSeverity: int
    source: str
    code: str | None = None


class LintResponse(BaseModel):
    projectId: str
    diagnostics: list[DiagnosticSchema]
