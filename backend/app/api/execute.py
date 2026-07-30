"""POST /api/v1/execute -- accept a Project Execution Payload and enqueue a run.
POST /api/v1/execute/{jobId}/stop -- cancel an in-flight execution job.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.execution_payload import ProjectExecutionPayload
from app.schemas.run import RunResponse, StopResponse
from app.services.execution_manager import ExecutionManager, get_execution_manager
from app.utils.exceptions import DockerExecutionError, JobAlreadyTerminatedError, JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["execute"])


@router.post("/execute", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def execute_project(
    payload: ProjectExecutionPayload,
    manager: ExecutionManager = Depends(get_execution_manager),
) -> RunResponse:
    """Queue a Project Execution Payload run.

    The payload is the complete, self-sufficient source of truth for the
    project -- no workspace scan happens here or anywhere downstream. The
    actual reconstruct/compile/simulate pipeline runs once the client
    subscribes to `/ws/execute/{jobId}` (see ExecutionManager.stream_execution).
    """

    # Lint-only mode is Verilator-specific (only VerilatorAdapter overrides
    # build_lint_command() -- see SimulatorAdapter.lint()'s base implementation,
    # which raises NotImplementedError for every other engine). Rejected here,
    # at the one place in this pipeline that's allowed to know which engine
    # is which, rather than letting ExecutionManager hit that exception
    # mid-stream (it deliberately never branches on simulator identity itself).
    if payload.execution.mode == "lint" and payload.execution.simulator != "verilator":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lint-only mode is only supported with Verilator, not '{payload.execution.simulator}'.",
        )

    try:
        await manager.check_docker_available()
    except DockerExecutionError as exc:
        logger.error("Docker is unavailable, rejecting execute request: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    job = manager.create_job(payload)

    return RunResponse(jobId=job.job_id, status=job.status)


@router.post("/execute/{jobId}/stop", response_model=StopResponse)
async def stop_execution(
    jobId: str,
    manager: ExecutionManager = Depends(get_execution_manager),
) -> StopResponse:
    try:
        job = manager.stop_job(jobId)
    except JobNotFoundError as exc:
        logger.warning("Stop requested for unknown execution job %s", jobId)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except JobAlreadyTerminatedError as exc:
        logger.warning("Stop requested for already-finished execution job %s", jobId)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return StopResponse(jobId=job.job_id, status=job.status)
