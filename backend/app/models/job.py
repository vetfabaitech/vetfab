"""In-memory job representation.

This is a plain in-memory stand-in for what will eventually be a PostgreSQL-backed
table (e.g. via SQLAlchemy models). Once persistence is introduced, this dataclass
can be replaced with an ORM model and the JobStore in execution_service.py can be
replaced with real database queries without changing the API surface.
"""

from dataclasses import dataclass, field

from app.models.diagnostic import Diagnostic
from app.schemas.common import HdlLanguage, JobStatus
from app.schemas.run import HdlFile


@dataclass
class Job:
    """Represents a single HDL execution job."""

    job_id: str
    project_id: str
    tab_id: str
    language: HdlLanguage
    files: list[HdlFile]
    status: JobStatus = JobStatus.QUEUED
    waveform_vcd: bytes | None = None
    waveform_filename: str | None = None
    compiler_output: str = ""
    stdout: str = ""
    stderr: str = ""
    logs: list[str] = field(default_factory=list)
    compile_diagnostics: list[Diagnostic] = field(default_factory=list)
    runtime_diagnostics: list[Diagnostic] = field(default_factory=list)
