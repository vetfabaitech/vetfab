"""Request/response schemas for POST /format."""

from pydantic import BaseModel


class FormatRequest(BaseModel):
    """Formats whatever is currently saved on disk for `filename` inside
    `workspace` (a project id) -- callers should `POST /workspace/save`
    first if the buffer has unsaved changes they want formatted."""

    workspace: str
    filename: str


class FormatResponse(BaseModel):
    filename: str
    formatted: str
