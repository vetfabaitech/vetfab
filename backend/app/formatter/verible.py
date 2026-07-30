"""Verible formatting service: runs `verible-verilog-format` only when a
format is explicitly requested (`POST /format`) -- never on a timer or
keystroke, matching the same on-demand-subprocess pattern as Verilator.
"""

import asyncio

from app.utils.exceptions import ToolExecutionError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class FormatterError(Exception):
    """Raised when verible-verilog-format exits non-zero (e.g. a syntax
    error in the file being formatted) -- distinct from ToolExecutionError,
    which means the binary itself couldn't be launched."""

    def __init__(self, stderr: str):
        self.stderr = stderr
        super().__init__(stderr)


class VeribleFormatter:
    """Formats a single file's source text via `verible-verilog-format`."""

    def __init__(self, command: str, timeout: int) -> None:
        self._command = command
        self._timeout = timeout

    async def format(self, source: str, filename: str) -> str:
        """`filename` is only used to give Verible the right file-type hint
        (via `--stdin_name`) -- the actual content always comes from `source`,
        never re-read from disk, so callers can format unsaved editor buffers."""

        args = [self._command, f"--stdin_name={filename}", "-"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except (OSError, FileNotFoundError) as exc:
            raise ToolExecutionError("verible-verilog-format", str(exc)) from exc

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=source.encode("utf-8")), timeout=self._timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise ToolExecutionError("verible-verilog-format", f"format timed out after {self._timeout}s")

        if proc.returncode != 0:
            raise FormatterError(stderr.decode("utf-8", errors="replace").strip())

        return stdout.decode("utf-8", errors="replace")
