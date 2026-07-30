"""POST /workspace/create, /workspace/open, /workspace/save, /workspace/delete.

Thin HTTP layer over `WorkspaceManager` -- see `app/workspace/manager.py` for
the actual on-disk directory lifecycle. Routers never contain business
logic, matching the rest of this backend (e.g. `app/api/project.py`).
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.workspace import (
    CreateWorkspaceRequest,
    DeleteWorkspaceRequest,
    OpenWorkspaceRequest,
    SaveWorkspaceRequest,
    WorkspaceResponse,
)
from app.utils.exceptions import InvalidWorkspacePathError
from app.utils.logger import get_logger
from app.workspace.manager import WorkspaceManager, get_workspace_manager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])


def _workspace_path(workspace_manager: WorkspaceManager, project_id: str) -> str:
    session = workspace_manager.get_session(project_id)
    return session.path.as_posix() if session else ""


@router.post("/create", response_model=WorkspaceResponse)
async def create_workspace(
    request: CreateWorkspaceRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
) -> WorkspaceResponse:
    try:
        await asyncio.to_thread(workspace_manager.ensure_open, request.projectId)
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return WorkspaceResponse(
        projectId=request.projectId,
        status="created",
        fileCount=0,
        workspacePath=_workspace_path(workspace_manager, request.projectId),
    )


@router.post("/open", response_model=WorkspaceResponse)
async def open_workspace(
    request: OpenWorkspaceRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
) -> WorkspaceResponse:
    """Creates the workspace if it doesn't exist yet and seeds/re-syncs it
    with the frontend's current file list -- safe to call every time a
    project is opened, not just the first time."""

    try:
        written = await asyncio.to_thread(
            workspace_manager.save_files, request.projectId, [(f.path, f.content) for f in request.files]
        )
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return WorkspaceResponse(
        projectId=request.projectId,
        status="opened",
        fileCount=len(written),
        workspacePath=_workspace_path(workspace_manager, request.projectId),
    )


@router.post("/save", response_model=WorkspaceResponse)
async def save_workspace(
    request: SaveWorkspaceRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
) -> WorkspaceResponse:
    try:
        written = await asyncio.to_thread(
            workspace_manager.save_files, request.projectId, [(f.path, f.content) for f in request.files]
        )
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return WorkspaceResponse(
        projectId=request.projectId,
        status="saved",
        fileCount=len(written),
        workspacePath=_workspace_path(workspace_manager, request.projectId),
    )


@router.post("/delete", response_model=WorkspaceResponse)
async def delete_workspace(
    request: DeleteWorkspaceRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
) -> WorkspaceResponse:
    try:
        await asyncio.to_thread(workspace_manager.delete, request.projectId)
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return WorkspaceResponse(projectId=request.projectId, status="deleted", fileCount=0)
