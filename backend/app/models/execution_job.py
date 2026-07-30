"""In-memory job representation for the Project Execution Payload run pipeline.

Separate from `models/job.py` (the legacy flat design/testbench pipeline) since
the two request shapes are unrelated; both eventually back onto the same
GET /api/v1/waveform/{jobId} lookup via WaveformService checking both stores.
"""

from dataclasses import dataclass, field

from app.models.diagnostic import Diagnostic
from app.schemas.common import JobStatus


@dataclass
class ExecutionJob:
    """Represents a single Project Execution Payload run."""

    job_id: str
    project_id: str | None
    tab_id: str
    workspace_version: int
    status: JobStatus = JobStatus.QUEUED
    waveform_vcd: bytes | None = None
    waveform_filename: str | None = None
    compiler_output: str = ""
    stdout: str = ""
    stderr: str = ""
    compile_exit_code: int | None = None
    run_exit_code: int | None = None
    execution_time_ms: int | None = None
    #: Copied from `payload.execution.mode` once resolved -- "lint" jobs never
    #: call `adapter.run()`, so `run_time_ms`/`run_exit_code` stay None.
    mode: str = "simulate"
    build_time_ms: int | None = None
    run_time_ms: int | None = None
    #: Id of the `SimulatorAdapter` that actually ran this job (e.g.
    #: "verilator", "iverilog") -- set once `SimulatorFactory.create()`
    #: resolves `execution.simulator` (see `ExecutionManager.stream_execution`).
    simulator_id: str | None = None
    compile_diagnostics: list[Diagnostic] = field(default_factory=list)
    runtime_diagnostics: list[Diagnostic] = field(default_factory=list)
