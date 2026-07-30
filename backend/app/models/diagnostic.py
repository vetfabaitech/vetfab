"""Diagnostic shape shared by the Verilator lint service and its API schema.

`monaco_severity` uses Monaco's own `MarkerSeverity` numeric scale (Hint=1,
Info=2, Warning=4, Error=8) so the frontend can pass diagnostics straight
into `monaco.editor.setModelMarkers` without a translation layer.
"""

from dataclasses import dataclass
from enum import IntEnum


class MonacoSeverity(IntEnum):
    HINT = 1
    INFO = 2
    WARNING = 4
    ERROR = 8


@dataclass
class Diagnostic:
    file: str  # workspace-relative path
    line: int
    column: int
    message: str
    severity: str  # "error" | "warning"
    monaco_severity: MonacoSeverity
    source: str  # "verilator"
    code: str | None = None
