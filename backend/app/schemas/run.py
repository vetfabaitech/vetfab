"""Request/response schemas for the /run and /stop endpoints."""

from pydantic import BaseModel, Field

from app.schemas.common import HdlLanguage, JobStatus


class HdlFile(BaseModel):
    """A single HDL source file submitted as part of a run request."""

    name: str = Field(..., description="File name, e.g. design.v")
    content: str = Field(..., description="Raw file contents")


class RunRequest(BaseModel):
    """Payload for POST /api/v1/run."""

    language: HdlLanguage
    projectId: str
    tabId: str
    files: list[HdlFile]


class RunResponse(BaseModel):
    """Response for POST /api/v1/run."""

    jobId: str
    status: JobStatus


class StopResponse(BaseModel):
    """Response for POST /api/v1/stop/{jobId}."""

    jobId: str
    status: JobStatus
