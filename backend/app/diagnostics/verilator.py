"""Verilator diagnostics service: on-demand lint, never a background process.

Verilator is invoked fresh for every `/lint` call (on save, or after the
frontend's own 800ms debounce -- see `settings.verilator_debounce_ms`) and
exits immediately after -- there is no long-lived Verilator process, unlike
svlangserver. `--lint-only` catches width mismatches, multiple drivers,
latch inference, unused signals, unconnected ports, sensitivity-list
warnings, and syntax errors, all via `-Wall`.
"""

import asyncio

from app.models.diagnostic import Diagnostic
from app.utils.exceptions import ToolExecutionError
from app.utils.logger import get_logger
from app.utils.verilator_diagnostics import parse_verilator_diagnostics

logger = get_logger(__name__)


class VerilatorService:
    """Runs `verilator --lint-only` against a workspace's files and parses
    its stderr output into Monaco-marker-shaped diagnostics."""

    def __init__(self, command: str, timeout: int) -> None:
        self._command = command
        self._timeout = timeout

    async def lint(self, workspace_dir: str, relative_files: list[str]) -> list[Diagnostic]:
        if not relative_files:
            return []

        # --timing: Verilator 5.x otherwise hard-errors (NEEDTIMINGOPT) on any
        #   testbench `#delay`, and those errors mask all real warnings.
        # -Wno-MULTITOP / -Wno-TIMESCALEMOD: unavoidable noise when linting a
        #   whole workspace (testbench + several tops, mixed `timescale use)
        #   rather than a single elaborated design.
        args = [
            self._command,
            "--lint-only",
            "-Wall",
            "-Wno-fatal",
            "--timing",
            "-Wno-MULTITOP",
            "-Wno-TIMESCALEMOD",
            "-Wno-DECLFILENAME",
            *relative_files,
        ]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                cwd=workspace_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (OSError, FileNotFoundError) as exc:
            raise ToolExecutionError("verilator", str(exc)) from exc

        try:
            _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=self._timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise ToolExecutionError("verilator", f"lint timed out after {self._timeout}s")

        return parse_verilator_diagnostics(stderr.decode("utf-8", errors="replace"))
