"""POST /api/v1/stop/{jobId} -- cancel a running (or queued) job."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.run import StopResponse
from app.services.execution_service import ExecutionService, get_execution_service
from app.utils.exceptions import JobAlreadyTerminatedError, JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["stop"])


@router.post("/stop/{jobId}", response_model=StopResponse)
async def stop_job(
    jobId: str,
    execution_service: ExecutionService = Depends(get_execution_service),
) -> StopResponse:
    """Terminate an in-flight job.

    TODO(docker): this should also stop/kill the corresponding container
    once real execution is wired up (see ExecutionService.stop_job).
    """

    try:
        job = execution_service.stop_job(jobId)
    except JobNotFoundError as exc:
        logger.warning("Stop requested for unknown job %s", jobId)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except JobAlreadyTerminatedError as exc:
        logger.warning("Stop requested for already-finished job %s", jobId)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return StopResponse(jobId=job.job_id, status=job.status)
