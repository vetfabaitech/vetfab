"""POST /api/v1/project/save, GET /api/v1/project/load/{projectId},
GET /api/v1/project/list, DELETE /api/v1/project/{projectId}.

Persists/restores the explorer's workspace snapshot -- content lives in S3,
metadata lives in Supabase Postgres. See
app/services/project_storage_service.py for the save/load reconciliation
logic and its per-owner access rules; every route here requires a valid
session (see app/api/deps.py) and scopes to the caller's own projects
(plus legacy ownerless rows -- see MetadataService.list_projects).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user_id
from app.schemas.project import (
    DeleteProjectResponse,
    ListProjectsResponse,
    LoadProjectResponse,
    ProjectSummary,
    SaveProjectRequest,
    SaveProjectResponse,
)
from app.services.project_storage_service import ProjectStorageService, get_project_storage_service
from app.utils.exceptions import S3StorageError, SupabaseError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/project", tags=["project"])


@router.post("/save", response_model=SaveProjectResponse)
async def save_project(
    request: SaveProjectRequest,
    owner_id: str = Depends(get_current_user_id),
    storage: ProjectStorageService = Depends(get_project_storage_service),
) -> SaveProjectResponse:
    try:
        saved_at, size_bytes = await storage.save_project(request.projectId, request.name, request.snapshot, owner_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (SupabaseError, S3StorageError) as exc:
        logger.error("Failed to save project '%s': %s", request.projectId, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return SaveProjectResponse(projectId=request.projectId, savedAt=saved_at, sizeBytes=size_bytes)


@router.get("/load/{project_id}", response_model=LoadProjectResponse)
async def load_project(
    project_id: str,
    owner_id: str = Depends(get_current_user_id),
    storage: ProjectStorageService = Depends(get_project_storage_service),
) -> LoadProjectResponse:
    try:
        snapshot, saved_at = await storage.load_project(project_id, owner_id)
    except (SupabaseError, S3StorageError) as exc:
        logger.error("Failed to load project '%s': %s", project_id, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return LoadProjectResponse(projectId=project_id, snapshot=snapshot, savedAt=saved_at)


@router.get("/list", response_model=ListProjectsResponse)
async def list_projects(
    owner_id: str = Depends(get_current_user_id),
    storage: ProjectStorageService = Depends(get_project_storage_service),
) -> ListProjectsResponse:
    try:
        rows = await storage.list_projects(owner_id)
    except SupabaseError as exc:
        logger.error("Failed to list projects: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return ListProjectsResponse(projects=[ProjectSummary.model_validate(row) for row in rows])


@router.delete("/{project_id}", response_model=DeleteProjectResponse)
async def delete_project(
    project_id: str,
    owner_id: str = Depends(get_current_user_id),
    storage: ProjectStorageService = Depends(get_project_storage_service),
) -> DeleteProjectResponse:
    try:
        await storage.delete_project(project_id, owner_id)
    except (SupabaseError, S3StorageError) as exc:
        logger.error("Failed to delete project '%s': %s", project_id, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return DeleteProjectResponse(projectId=project_id, deleted=True)
