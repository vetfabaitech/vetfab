"""POST /lint -- runs Verilator on demand (frontend calls this on save, or
after its own 800ms debounce; Verilator itself is never kept running)."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.diagnostics.verilator import VerilatorService
from app.schemas.diagnostics import LintRequest, LintResponse
from app.utils.diagnostic_serialization import diagnostic_to_schema
from app.utils.exceptions import InvalidWorkspacePathError, ToolExecutionError
from app.utils.logger import get_logger
from app.workspace.manager import WorkspaceManager, get_workspace_manager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["diagnostics"])


def get_verilator_service(settings: Settings = Depends(get_settings)) -> VerilatorService:
    return VerilatorService(settings.verilator_cmd, settings.verilator_timeout)


@router.post("/lint", response_model=LintResponse)
async def lint_project(
    request: LintRequest,
    workspace_manager: WorkspaceManager = Depends(get_workspace_manager),
    verilator: VerilatorService = Depends(get_verilator_service),
) -> LintResponse:
    try:
        relative_paths = await asyncio.to_thread(
            workspace_manager.save_files, request.projectId, [(f.path, f.content) for f in request.files]
        )
    except InvalidWorkspacePathError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    session = workspace_manager.get_session(request.projectId)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace '{request.projectId}' not found")

    try:
        diagnostics = await verilator.lint(str(session.path), relative_paths)
    except ToolExecutionError as exc:
        logger.error("Verilator unavailable for project=%s: %s", request.projectId, exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return LintResponse(
        projectId=request.projectId,
        diagnostics=[diagnostic_to_schema(d) for d in diagnostics],
    )
