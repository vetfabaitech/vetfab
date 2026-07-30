"""Waveform service: resolves the raw VCD content for a completed job.

Checks both job registries (the legacy flat design/testbench pipeline and the
Project Execution Payload pipeline) so the frontend can keep fetching
GET /api/v1/waveform/{jobId}/raw the same way regardless of which pipeline
produced the job.
"""

from app.services.execution_manager import ExecutionManager
from app.services.execution_service import ExecutionService
from app.utils.exceptions import JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class WaveformService:
    """Resolves waveform (VCD) data for jobs from either job registry."""

    def __init__(self, execution_service: ExecutionService, execution_manager: ExecutionManager) -> None:
        self._execution_service = execution_service
        self._execution_manager = execution_manager

    def _get_waveform_vcd(self, job_id: str) -> bytes | None:
        try:
            return self._execution_service.get_job(job_id).waveform_vcd
        except JobNotFoundError:
            pass
        return self._execution_manager.get_job(job_id).waveform_vcd

    def has_waveform(self, job_id: str) -> bool:
        return self._get_waveform_vcd(job_id) is not None

    def get_waveform_vcd(self, job_id: str) -> bytes | None:
        """Return the job's raw VCD bytes, or None if it has none

        (e.g. compilation failed or the testbench didn't dump a waveform).
        Raises JobNotFoundError if the id exists in neither registry.
        """

        return self._get_waveform_vcd(job_id)


def get_waveform_service() -> WaveformService:
    """FastAPI dependency provider for WaveformService."""

    from app.services.execution_manager import execution_manager
    from app.services.execution_service import execution_service

    return WaveformService(execution_service, execution_manager)
