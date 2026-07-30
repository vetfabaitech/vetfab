"""POST /api/v1/run -- accept an HDL execution request and enqueue a job."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.run import RunRequest, RunResponse
from app.services.execution_service import ExecutionService, get_execution_service
from app.utils.exceptions import DockerExecutionError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["run"])


@router.post("/run", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_hdl(
    request: RunRequest,
    execution_service: ExecutionService = Depends(get_execution_service),
) -> RunResponse:
    """Queue an HDL execution job.

    The actual container creation / compile / simulate pipeline runs once the
    client subscribes to `/ws/run/{jobId}` (see execution_service.stream_execution).
    """

    try:
        await execution_service.check_docker_available()
    except DockerExecutionError as exc:
        logger.error("Docker is unavailable, rejecting run request: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    job = execution_service.create_job(request)

    return RunResponse(jobId=job.job_id, status=job.status)
