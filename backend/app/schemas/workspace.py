"""Request/response schemas for the /workspace/* endpoints."""

from pydantic import BaseModel, Field


class WorkspaceFile(BaseModel):
    """One file's current editor-buffer content, keyed by its workspace-
    relative path (e.g. 'rtl/alu.sv'), not a bare filename -- workspaces are
    real nested directories on disk, unlike the flat two-file run pipeline."""

    path: str
    content: str


class CreateWorkspaceRequest(BaseModel):
    projectId: str


class OpenWorkspaceRequest(BaseModel):
    """`files` seeds (or re-syncs) the on-disk workspace from the frontend's
    current explorer state -- see `flattenTreeForTerminal` on the frontend
    for the equivalent shape already used for the terminal's `init` message."""

    projectId: str
    files: list[WorkspaceFile] = Field(default_factory=list)


class SaveWorkspaceRequest(BaseModel):
    projectId: str
    files: list[WorkspaceFile]


class DeleteWorkspaceRequest(BaseModel):
    projectId: str


class WorkspaceResponse(BaseModel):
    projectId: str
    status: str
    fileCount: int
    # Absolute on-disk workspace directory (posix-style), e.g.
    # "/data/workspaces/my-project". The frontend LSP client needs this to
    # build file:// URIs that match what svlangserver sees on disk -- with
    # made-up URIs, its indexer ENOENTs and definition/references return
    # nothing. Empty only for "deleted" responses.
    workspacePath: str = ""
