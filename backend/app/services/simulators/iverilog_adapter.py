"""Icarus Verilog adapter -- preserves the exact compile/run behavior this
project shipped with before the Verilator migration, just moved behind the
`SimulatorAdapter` interface so `ExecutionManager`/`ExecutionService` no
longer need to know Icarus exists.

Kept (not deleted) as the second, backward-compatible engine per the
migration's explicit requirement to keep Icarus available via
`SimulatorFactory` alongside Verilator.
"""

from __future__ import annotations

import re

from app.models.diagnostic import Diagnostic, MonacoSeverity
from app.services.simulators.base import SimulatorAdapter

_ARTIFACT_NAME = "sim.out"

# Ported from the frontend's former `compilerOutputParser.ts` (client-side
# regex) -- iverilog's compile diagnostics are consistently `file:line:
# message`, optionally prefixed with `error:`/`warning:`. Anything
# unprefixed is treated as an error, since iverilog only annotates warnings
# explicitly. Moved server-side so diagnostic parsing is unified across
# engines instead of duplicated per-engine on the client.
_LINE_RE = re.compile(r"^([^\s:][^:]*):(\d+):\s*(?:(error|warning):\s*)?(.+)$", re.IGNORECASE)


class IcarusAdapter(SimulatorAdapter):
    id = "iverilog"
    display_name = "Icarus Verilog"

    def required_compiler_flags(self) -> list[str]:
        return ["-g2012"]

    def supported_waveform_formats(self) -> list[str]:
        return ["vcd"]

    def waveform_compile_flags(self, waveform_format: str) -> list[str]:
        if waveform_format not in self.supported_waveform_formats():
            raise ValueError(f"iverilog does not support waveform format '{waveform_format}'")
        # No compile-time flag needed: iverilog testbenches call
        # `$dumpfile`/`$dumpvars` themselves and iverilog always honors them.
        return []

    def build_compile_command(
        self,
        compile_paths: list[str],
        compiler_args: list[str],
        *,
        top_module: str | None = None,
        waveform_enabled: bool = False,
        waveform_format: str = "vcd",
    ) -> str:
        del top_module  # iverilog auto-elaborates the module nothing else instantiates
        flags = [*self.required_compiler_flags(), *compiler_args]
        if waveform_enabled:
            flags += self.waveform_compile_flags(waveform_format)
        files = " ".join(compile_paths)
        return f"iverilog {' '.join(flags)} -o {_ARTIFACT_NAME} {files}".replace("  ", " ").strip()

    def build_run_command(self) -> str:
        return f"vvp {_ARTIFACT_NAME}"

    def parse_compiler_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        combined = "\n".join(part for part in (stdout, stderr) if part.strip())
        diagnostics: list[Diagnostic] = []
        for raw_line in combined.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            match = _LINE_RE.match(line)
            if not match:
                continue
            file, line_no, severity_word, message = match.groups()
            severity = severity_word.lower() if severity_word else "error"
            diagnostics.append(
                Diagnostic(
                    file=file.strip(),
                    line=int(line_no),
                    column=1,
                    message=message.strip(),
                    severity=severity,
                    monaco_severity=MonacoSeverity.ERROR if severity == "error" else MonacoSeverity.WARNING,
                    source="iverilog",
                    code=None,
                )
            )
        return diagnostics

    def parse_runtime_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        del stdout, stderr
        # `vvp`'s stdout is user `$display` output, not diagnostics; iverilog
        # has no structured runtime-error convention to parse.
        return []
