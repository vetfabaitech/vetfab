"""Execution Manager: orchestrates a Project Execution Payload run end to end --
reconstruct workspace -> resolve simulator -> compile -> simulate -> collect
waveform -> cleanup.

Mirrors execution_service.py's proven job-lifecycle/streaming pattern, but
consumes a full ProjectExecutionPayload instead of a flat two-file request,
and drives dynamic (not fixed-shape) compile/run steps through whichever
`SimulatorAdapter` `payload.execution.simulator` resolves to (see
`app/services/simulators/factory.py`). This class never branches on
"iverilog" vs "verilator" itself -- it only calls the adapter's
`compile()`/`run()` and reads back a uniform `CompileResult`/`RunResult`.
No workspace scanning happens here or anywhere below it -- `payload` is the
only source of truth.
"""

import asyncio
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.config import get_settings
from app.models.diagnostic import Diagnostic
from app.models.execution_job import ExecutionJob
from app.schemas.common import JobStatus
from app.schemas.execution_payload import ProjectExecutionPayload
from app.services.docker_service import DockerService
from app.services.simulators import SimulatorFactory
from app.services.workspace_reconstructor import WorkspaceReconstructor
from app.utils.exceptions import DockerExecutionError, JobAlreadyTerminatedError, JobNotFoundError
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _log(message: str) -> dict[str, Any]:
    return {"type": "log", "message": message}


def _diagnostic_dict(d: Diagnostic) -> dict[str, Any]:
    return {
        "file": d.file,
        "line": d.line,
        "column": d.column,
        "message": d.message,
        "severity": d.severity,
        "code": d.code,
    }


def _output(stream: str, text: str, diagnostics: list[Diagnostic] | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {"type": "output", "stream": stream, "text": text}
    if diagnostics:
        # Additive field: older frontend builds that don't read `diagnostics`
        # keep working off `text` exactly as before (see useCompilerMarkers.ts).
        message["diagnostics"] = [_diagnostic_dict(d) for d in diagnostics]
    return message


def _resolve_compile_paths(payload: ProjectExecutionPayload) -> list[str]:
    """execution.compileFiles if the analyzer populated it, else fall back to
    analysis.compilationOrder filtered to design/testbench categories (include
    files are pulled in via `include` directives, not compiled as standalone
    units). Both are lists of file ids; translated to real relative paths here."""

    file_ids = payload.execution.compileFiles or [
        fid for fid in payload.analysis.compilationOrder if payload.files.get(fid, None) and payload.files[fid].category in ("rtl", "testbench")
    ]
    return [payload.files[fid].path for fid in file_ids if fid in payload.files]


class ExecutionManager:
    """Manages Project Execution Payload runs and drives the real
    reconstruct+compile+simulate pipeline."""

    def __init__(self) -> None:
        self._jobs: dict[str, ExecutionJob] = {}
        self._payloads: dict[str, ProjectExecutionPayload] = {}
        self._containers: dict[str, Any] = {}

        settings = get_settings()
        self._docker_service = DockerService(
            image=settings.docker_image,
            workdir=settings.docker_workdir,
            exec_timeout=settings.docker_exec_timeout,
            mem_limit=settings.docker_mem_limit,
        )
        self._reconstructor = WorkspaceReconstructor()

    def create_job(self, payload: ProjectExecutionPayload) -> ExecutionJob:
        job_id = str(uuid.uuid4())
        job = ExecutionJob(
            job_id=job_id,
            project_id=payload.project.id,
            tab_id=payload.workspace.tabId,
            workspace_version=payload.workspace.version,
            status=JobStatus.QUEUED,
        )
        self._jobs[job_id] = job
        self._payloads[job_id] = payload
        logger.info(
            "Execution job %s queued for project=%s workspaceVersion=%s (%d file(s))",
            job_id,
            payload.project.name,
            payload.workspace.version,
            len(payload.files),
        )
        return job

    def get_job(self, job_id: str) -> ExecutionJob:
        job = self._jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    async def check_docker_available(self) -> None:
        await asyncio.to_thread(self._docker_service.ping)

    def stop_job(self, job_id: str) -> ExecutionJob:
        job = self.get_job(job_id)
        if job.status in (JobStatus.COMPLETED, JobStatus.TERMINATED, JobStatus.FAILED):
            raise JobAlreadyTerminatedError(job_id, job.status.value)

        job.status = JobStatus.TERMINATED
        container = self._containers.get(job_id)
        if container is not None:
            self._docker_service.kill_container(container)
        logger.info("Execution job %s terminated", job_id)
        return job

    async def stream_execution(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        job = self.get_job(job_id)
        payload = self._payloads.get(job_id)
        if payload is None:
            raise JobNotFoundError(job_id)

        job.status = JobStatus.RUNNING
        yield _log("Request Received")
        started_at = time.monotonic()

        container: Any = None
        try:
            adapter = SimulatorFactory.create(payload.execution.simulator)
            job.simulator_id = adapter.id
            job.mode = payload.execution.mode
            yield _log(f"Simulator: {adapter.display_name}")

            yield _log("Creating Docker Container")
            container = await asyncio.to_thread(self._docker_service.create_container, job_id)
            self._containers[job_id] = container

            if self._terminated(job):
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            yield _log("Reconstructing Workspace")
            files = await asyncio.to_thread(self._reconstructor.reconstruct, payload)
            yield _log(f"Reconstructed {len(files)} file(s) from payload")
            await asyncio.to_thread(self._docker_service.copy_workspace_files, container, files)

            compile_paths = _resolve_compile_paths(payload)

            if self._terminated(job):
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            # Elaboration root: the *testbench* module (it owns the
            # `initial`/`$dumpvars`/`$finish` blocks), not the RTL design's
            # own top -- falls back to topModule only for an RTL-only
            # compile with no testbench selected. Icarus ignores this
            # (it auto-elaborates); Verilator needs it as `--top-module`
            # whenever more than one candidate top exists in the file set.
            elaboration_top = payload.execution.testbench or payload.execution.topModule

            is_lint = payload.execution.mode == "lint"
            build_started_at = time.monotonic()
            if is_lint:
                yield _log(f"Syntax Check Started ({len(compile_paths)} file(s))")
                compile_result = await self._run_with_timeout(
                    adapter.lint, self._docker_service, container, compile_paths
                )
            else:
                yield _log(f"Compilation Started ({len(compile_paths)} file(s))")
                compile_result = await self._run_with_timeout(
                    adapter.compile,
                    self._docker_service,
                    container,
                    compile_paths,
                    payload.execution.compilerArgs,
                    top_module=elaboration_top,
                    waveform_enabled=payload.execution.waveform.enabled,
                    waveform_format=payload.execution.waveform.format,
                )
            job.build_time_ms = int((time.monotonic() - build_started_at) * 1000)
            job.compiler_output = "\n".join(
                part.strip() for part in (compile_result.stdout, compile_result.stderr) if part.strip()
            )
            job.compile_exit_code = compile_result.exit_code
            job.compile_diagnostics = compile_result.diagnostics
            yield _log("Syntax Check Finished" if is_lint else "Compilation Finished")
            if job.compiler_output:
                yield _output("compiler", job.compiler_output, diagnostics=compile_result.diagnostics)

            if self._terminated(job):
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            if compile_result.exit_code != 0:
                job.status = JobStatus.FAILED
                job.stderr = compile_result.stderr.strip()
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            if is_lint:
                # Lint mode stops here by design -- never calls adapter.run(),
                # never produces a waveform. A clean compile with no errors is
                # itself the success condition (see _finish's status derivation).
                job.status = JobStatus.COMPLETED
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            yield _log("Simulation Started")
            run_started_at = time.monotonic()
            sim_result = await self._run_with_timeout(adapter.run, self._docker_service, container)
            job.run_time_ms = int((time.monotonic() - run_started_at) * 1000)
            job.stdout = sim_result.stdout.strip()
            job.stderr = sim_result.stderr.strip()
            job.run_exit_code = sim_result.exit_code
            job.runtime_diagnostics = sim_result.diagnostics
            yield _log("Simulation Finished")
            if job.stdout:
                yield _output("stdout", job.stdout)
            if job.stderr:
                yield _output("stderr", job.stderr)

            if self._terminated(job):
                async for msg in self._finish(job, container, started_at):
                    yield msg
                return

            job.status = JobStatus.FAILED if sim_result.exit_code != 0 else JobStatus.COMPLETED

            if payload.execution.waveform.enabled:
                waveform_name = await asyncio.to_thread(self._docker_service.find_waveform_file, container)
                if waveform_name:
                    job.waveform_filename = waveform_name
                    job.waveform_vcd = await asyncio.to_thread(
                        self._docker_service.extract_file, container, waveform_name
                    )

            async for msg in self._finish(job, container, started_at):
                yield msg

        except DockerExecutionError as exc:
            logger.error("Execution failed for job %s: %s", job_id, exc)
            if job.status != JobStatus.TERMINATED:
                job.status = JobStatus.FAILED
                job.stderr = str(exc)
            async for msg in self._finish(job, container, started_at):
                yield msg
        finally:
            self._containers.pop(job_id, None)
            self._payloads.pop(job_id, None)

    async def _run_with_timeout(self, func, *args, **kwargs):
        timeout = self._docker_service.exec_timeout
        try:
            return await asyncio.wait_for(asyncio.to_thread(func, *args, **kwargs), timeout=timeout)
        except asyncio.TimeoutError as exc:
            raise DockerExecutionError(f"'{func.__name__}' timed out after {timeout}s") from exc

    @staticmethod
    def _terminated(job: ExecutionJob) -> bool:
        return job.status == JobStatus.TERMINATED

    async def _finish(self, job: ExecutionJob, container: Any, started_at: float) -> AsyncIterator[dict[str, Any]]:
        yield _log("Cleaning Resources")
        if container is not None:
            await asyncio.to_thread(self._docker_service.destroy_container, container)
            yield _log("Container Destroyed")

        job.execution_time_ms = int((time.monotonic() - started_at) * 1000)
        yield _log("Execution Finished")

        all_diagnostics = [*job.compile_diagnostics, *job.runtime_diagnostics]
        warning_count = sum(1 for d in all_diagnostics if d.severity == "warning")
        error_count = sum(1 for d in all_diagnostics if d.severity == "error")

        yield {
            "type": "result",
            "status": job.status.value,
            "mode": job.mode,
            "stdout": job.stdout,
            "stderr": job.stderr,
            "compilerOutput": job.compiler_output,
            "compileExitCode": job.compile_exit_code,
            "runExitCode": job.run_exit_code,
            "hasWaveform": job.waveform_vcd is not None,
            "waveformFilename": job.waveform_filename,
            "executionTimeMs": job.execution_time_ms,
            "buildTimeMs": job.build_time_ms,
            "runTimeMs": job.run_time_ms,
            "warningCount": warning_count,
            "errorCount": error_count,
            "simulator": job.simulator_id,
            "diagnostics": [_diagnostic_dict(d) for d in all_diagnostics],
        }


# Module-level singleton so routers/websockets share job state without a DB.
execution_manager = ExecutionManager()


def get_execution_manager() -> ExecutionManager:
    """FastAPI dependency provider for ExecutionManager."""

    return execution_manager
