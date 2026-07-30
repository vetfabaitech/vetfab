"""Schema for the final execution result, sent as the last message on /ws/run/{jobId}."""

from pydantic import BaseModel, Field

from app.schemas.common import JobStatus
from app.schemas.diagnostics import DiagnosticSchema


class ExecutionResult(BaseModel):
    """Structured result of a compile+simulate run.

    This is sent as a `{"type": "result", ...}` websocket message. The VCD
    itself is never sent inline -- when `hasWaveform` is true, the frontend
    fetches the raw file from GET /api/v1/waveform/{jobId}/raw and hands it to
    the embedded Surfer viewer.
    """

    status: JobStatus
    stdout: str
    stderr: str
    compilerOutput: str
    hasWaveform: bool
    # Additive: structured compile+runtime diagnostics from whichever
    # SimulatorAdapter ran the job (see app/services/simulators/). Older
    # frontend builds that don't read this field keep working off
    # `compilerOutput`'s raw text exactly as before.
    diagnostics: list[DiagnosticSchema] = Field(default_factory=list)
