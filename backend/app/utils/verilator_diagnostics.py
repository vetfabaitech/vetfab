"""Shared `%Warning`/`%Error` line parser for Verilator output.

Extracted from `app/diagnostics/verilator.py` (the on-demand `/lint`
service) so the Verilator simulator adapter
(`app/services/simulators/verilator_adapter.py`) can parse the exact same
diagnostic shape from a real compile run instead of maintaining a second,
slightly different regex that would inevitably drift from this one.
"""

import re

from app.models.diagnostic import Diagnostic, MonacoSeverity

# Matches e.g. "%Warning-WIDTH: design.v:12:5: message text" or
# "%Error: design.v:4:1: syntax error, unexpected ..." -- Verilator emits
# plain "%Error:"/"%Warning:" (no code) for some diagnostics too.
_DIAG_RE = re.compile(
    r"^%(?P<severity>Warning|Error)(?:-(?P<code>[A-Z0-9_]+))?:\s*"
    r"(?:(?P<file>[^:\s][^:]*):(?P<line>\d+):(?P<col>\d+):\s*)?"
    r"(?P<message>.*)$"
)


def parse_verilator_diagnostics(output: str) -> list[Diagnostic]:
    """Parses Verilator's `%Warning`/`%Error` lines out of `output` (its
    stderr) into Monaco-marker-shaped `Diagnostic`s. Non-matching lines
    (continuation/context lines, e.g. "... In instance top") are skipped."""

    diagnostics: list[Diagnostic] = []
    for line in output.splitlines():
        match = _DIAG_RE.match(line.strip())
        if not match:
            continue

        severity = match.group("severity")
        file = match.group("file")
        line_no = match.group("line")
        col_no = match.group("col")
        message = match.group("message").strip()
        code = match.group("code")

        diagnostics.append(
            Diagnostic(
                file=file or "",
                line=int(line_no) if line_no else 1,
                column=int(col_no) if col_no else 1,
                message=f"[{code}] {message}" if code else message,
                severity="error" if severity == "Error" else "warning",
                monaco_severity=MonacoSeverity.ERROR if severity == "Error" else MonacoSeverity.WARNING,
                source="verilator",
                code=code,
            )
        )
    return diagnostics
