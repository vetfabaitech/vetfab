"""Execution service: owns job lifecycle and drives the real compile+simulate pipeline.

MVP scope: no queue/worker pool -- the pipeline runs directly inside the async
generator consumed by /ws/run/{jobId}, one fresh Docker container per job.

This is the *legacy* flat two-file (design + testbench) pipeline -- kept for
backward compatibility. `RunRequest` has no `simulator` field, so this
pipeline always runs Icarus Verilog via `IcarusAdapter`, unlike
`ExecutionManager`'s Project Execution Payload pipeline (`/api/v1/execute`),
which resolves whichever engine `execution.simulator` names through
`SimulatorFactory`. Both now build their compile/run commands through the
same `SimulatorAdapter` interface -- neither hardcodes an `iverilog`/`vvp`
string anymore.

Integration point for later work:
  - PostgreSQL: `_jobs` is an in-memory dict standing in for a `jobs` table. Swap
    `create_job` / `get_job` for async DB calls once persistence is added.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.config import get_settings
from app.models.job import Job
from app.schemas.common import JobStatus
from app.schemas.result import ExecutionResult
from app.schemas.run import RunRequest
from app.services.docker_service import DockerService
from app.services.simulators.iverilog_adapter import IcarusAdapter
from app.services.terminal_service import get_terminal_service
from app.utils.diagnostic_serialization import diagnostic_to_schema
from app.utils.exceptions import DockerExecutionError, JobAlreadyTerminatedError, JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _log(message: str) -> dict[str, Any]:
    """A lifecycle/progress message -- destined for the frontend's Logs panel only."""

    return {"type": "log", "message": message}


def _output(stream: str, text: str) -> dict[str, Any]:
    """A chunk of compiler/simulation output -- destined for the Output panel only."""

    return {"type": "output", "stream": stream, "text": text}


def _result(result: ExecutionResult) -> dict[str, Any]:
    """The final structured result. The VCD itself is never sent inline -- the
    frontend fetches it from GET /api/v1/waveform/{jobId}/raw when hasWaveform is true."""

    return {"type": "result", **result.model_dump()}


class ExecutionService:
    """Manages HDL execution jobs and runs the real Docker compile+simulate pipeline."""

    def __init__(self) -> None:
        # TODO(postgres): replace this in-memory dict with a `jobs` table.
        self._jobs: dict[str, Job] = {}
        self._containers: dict[str, Any] = {}

        settings = get_settings()
        self._docker_service = DockerService(
            image=settings.docker_image,
            workdir=settings.docker_workdir,
            exec_timeout=settings.docker_exec_timeout,
            mem_limit=settings.docker_mem_limit,
        )
        self._adapter = IcarusAdapter()

    def create_job(self, request: RunRequest) -> Job:
        """Register a new job. The actual container/compile/simulate work happens
        once the client connects to /ws/run/{jobId} (see stream_execution)."""

        job_id = str(uuid.uuid4())
        job = Job(
            job_id=job_id,
            project_id=request.projectId,
            tab_id=request.tabId,
            language=request.language,
            files=request.files,
            status=JobStatus.QUEUED,
        )
        self._jobs[job_id] = job
        logger.info("Job %s queued for project=%s tab=%s", job_id, request.projectId, request.tabId)
        return job

    def get_job(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    async def check_docker_available(self) -> None:
        """Preflight check used by POST /run to fail fast with a 500 if Docker is down."""

        await asyncio.to_thread(self._docker_service.ping)

    def stop_job(self, job_id: str) -> Job:
        """Cancel a job: mark it terminated and kill its container if one is running.

        The pipeline (stream_execution) notices the TERMINATED status at its next
        checkpoint and performs the actual container removal/cleanup.
        """

        job = self.get_job(job_id)
        if job.status in (JobStatus.COMPLETED, JobStatus.TERMINATED, JobStatus.FAILED):
            raise JobAlreadyTerminatedError(job_id, job.status.value)

        job.status = JobStatus.TERMINATED
        container = self._containers.get(job_id)
        if container is not None:
            self._docker_service.kill_container(container)
        logger.info("Job %s terminated", job_id)
        return job

    async def stream_execution(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        """Run the real compile+simulate pipeline, yielding log/output/result messages."""

        job = self.get_job(job_id)
        job.status = JobStatus.RUNNING
        yield _log("Request Received")

        container: Any = None
        try:
            yield _log("Creating Docker Container")
            container = await asyncio.to_thread(self._docker_service.create_container, job_id)
            self._containers[job_id] = container

            if self._terminated(job):
                async for msg in self._finish(job, container):
                    yield msg
                return

            await asyncio.to_thread(self._docker_service.copy_files, container, job.files)

            yield _log("Compilation Started")
            compile_result = await self._run_with_timeout(
                self._adapter.compile, self._docker_service, container, [f.name for f in job.files], []
            )
            job.compiler_output = "\n".join(
                part.strip() for part in (compile_result.stdout, compile_result.stderr) if part.strip()
            )
            job.compile_diagnostics = compile_result.diagnostics
            yield _log("Compilation Finished")
            if job.compiler_output:
                yield _output("compiler", job.compiler_output)

            if self._terminated(job):
                async for msg in self._finish(job, container):
                    yield msg
                return

            if compile_result.exit_code != 0:
                job.status = JobStatus.FAILED
                job.stderr = compile_result.stderr.strip()
                async for msg in self._finish(job, container):
                    yield msg
                return

            yield _log("Simulation Started")
            sim_result = await self._run_with_timeout(self._adapter.run, self._docker_service, container)
            job.stdout = sim_result.stdout.strip()
            job.stderr = sim_result.stderr.strip()
            job.runtime_diagnostics = sim_result.diagnostics
            yield _log("Simulation Finished")
            if job.stdout:
                yield _output("stdout", job.stdout)
            if job.stderr:
                yield _output("stderr", job.stderr)

            if self._terminated(job):
                async for msg in self._finish(job, container):
                    yield msg
                return

            job.status = JobStatus.FAILED if sim_result.exit_code != 0 else JobStatus.COMPLETED

            waveform_name = await asyncio.to_thread(self._docker_service.find_waveform_file, container)
            if waveform_name:
                job.waveform_filename = waveform_name
                job.waveform_vcd = await asyncio.to_thread(
                    self._docker_service.extract_file, container, waveform_name
                )

            async for msg in self._finish(job, container):
                yield msg

        except DockerExecutionError as exc:
            logger.error("Docker execution failed for job %s: %s", job_id, exc)
            if job.status != JobStatus.TERMINATED:
                job.status = JobStatus.FAILED
                job.stderr = str(exc)
            async for msg in self._finish(job, container):
                yield msg
        finally:
            self._containers.pop(job_id, None)

    async def _run_with_timeout(self, func, *args):
        timeout = self._docker_service.exec_timeout
        try:
            return await asyncio.wait_for(asyncio.to_thread(func, *args), timeout=timeout)
        except asyncio.TimeoutError as exc:
            raise DockerExecutionError(f"'{func.__name__}' timed out after {timeout}s") from exc

    @staticmethod
    def _terminated(job: Job) -> bool:
        return job.status == JobStatus.TERMINATED

    async def _finish(self, job: Job, container: Any) -> AsyncIterator[dict[str, Any]]:
        """Always destroy the container (this also removes the generated .vcd along
        with it; host temp files are already cleaned up by DockerService.copy_files
        as soon as the copy completes) and emit the final result message."""

        yield _log("Cleaning Resources")
        if container is not None:
            await asyncio.to_thread(self._docker_service.destroy_container, container)
            yield _log("Container Destroyed")
        yield _log("Execution Finished")
        yield _result(
            ExecutionResult(
                status=job.status,
                stdout=job.stdout,
                stderr=job.stderr,
                compilerOutput=job.compiler_output,
                hasWaveform=job.waveform_vcd is not None,
                diagnostics=[
                    diagnostic_to_schema(d) for d in (*job.compile_diagnostics, *job.runtime_diagnostics)
                ],
            )
        )
        await self._mirror_to_terminal_sessions(job)

    async def _mirror_to_terminal_sessions(self, job: Job) -> None:
        """Best-effort: if the project has a live terminal session open, copy this
        job's waveform/output into it so `ls`/`cat` see the same results the Run
        panel just showed. Never raises -- must not disrupt the run pipeline."""

        terminal_service = get_terminal_service()
        if not terminal_service.has_sessions(job.project_id):
            return

        try:
            files: dict[str, bytes] = {}
            if job.waveform_vcd is not None and job.waveform_filename:
                files[job.waveform_filename] = job.waveform_vcd
            if job.compiler_output:
                files["compiler_output.log"] = job.compiler_output.encode("utf-8")
            if job.stdout or job.stderr:
                files["sim_output.log"] = f"{job.stdout}\n{job.stderr}".strip().encode("utf-8")

            if files:
                await terminal_service.mirror_artifacts(job.project_id, files)
        except Exception as exc:  # noqa: BLE001 -- deliberately broad, this is a side channel
            logger.warning("Failed to mirror job %s artifacts into terminal sessions: %s", job.job_id, exc)


# Module-level singleton so routers/websockets share job state without a DB.
# TODO(postgres): once persistence exists, this can become a thin factory
# that hands out a service backed by a real database session/connection pool.
execution_service = ExecutionService()


def get_execution_service() -> ExecutionService:
    """FastAPI dependency provider for ExecutionService."""

    return execution_service
