"""Request/response schemas for the /project save and load endpoints."""

from typing import Any

from pydantic import BaseModel, Field


class SaveProjectRequest(BaseModel):
    """Payload for POST /api/v1/project/save.

    `snapshot` is the explorer store's own workspace-snapshot JSON (nodes,
    rootId, workspaceName, ...) passed through opaquely -- the backend never
    parses its shape, it just stores the blob and mirrors size/name into the
    `projects` metadata row.
    """

    projectId: str
    name: str
    snapshot: dict[str, Any] = Field(..., description="Explorer workspace-snapshot JSON")


class SaveProjectResponse(BaseModel):
    """Response for POST /api/v1/project/save."""

    projectId: str
    savedAt: str
    sizeBytes: int


class LoadProjectResponse(BaseModel):
    """Response for GET /api/v1/project/load/{projectId}.

    `snapshot` is None when nothing has been saved for this project yet --
    callers should keep whatever local/seed state they already have.
    """

    projectId: str
    snapshot: dict[str, Any] | None
    savedAt: str | None


class ProjectSummary(BaseModel):
    """One row of GET /api/v1/project/list.

    `validation_alias` (not `alias`) on purpose: parses Supabase's snake_case
    row (size_bytes/updated_at) on the way in, but serializes as camelCase
    on the way out -- FastAPI's response_model_by_alias defaults to True, so
    a plain `alias` would've made the JSON response snake_case too, breaking
    the frontend's ProjectSummary (which expects sizeBytes/updatedAt).
    """

    id: str
    name: str
    sizeBytes: int = Field(..., validation_alias="size_bytes")
    updatedAt: str = Field(..., validation_alias="updated_at")


class ListProjectsResponse(BaseModel):
    """Response for GET /api/v1/project/list."""

    projects: list[ProjectSummary]


class DeleteProjectResponse(BaseModel):
    """Response for DELETE /api/v1/project/{projectId}."""

    projectId: str
    deleted: bool
