"""Shared enums and constants used across schemas and services."""

from enum import Enum


class JobStatus(str, Enum):
    """Lifecycle states for an HDL execution job."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    TERMINATED = "terminated"
    FAILED = "failed"


class HdlLanguage(str, Enum):
    """HDL languages supported by the WebIDE."""

    VERILOG = "verilog"
    VHDL = "vhdl"
    SYSTEMVERILOG = "systemverilog"
