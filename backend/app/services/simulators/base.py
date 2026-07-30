"""Simulator abstraction: the one seam between the execution pipeline
(`ExecutionManager`/`ExecutionService`) and whatever HDL toolchain actually
compiles/runs a design inside the sandbox container.

`ExecutionManager` never spells out "iverilog" or "verilator" itself -- it
resolves a `SimulatorAdapter` via `SimulatorFactory` (see `factory.py`) from
the payload's `execution.simulator` id, then only ever calls the four
methods below. `DockerService` stays fully generic: it knows how to create
containers and run an arbitrary command string inside one, never which
engine produced that command.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.models.diagnostic import Diagnostic

if TYPE_CHECKING:
    from docker.models.containers import Container

    from app.services.docker_service import DockerService, ExecResult


@dataclass
class CompileResult:
    """Outcome of a compile (or lint) step: the raw process result plus
    whatever structured diagnostics the adapter could extract from it.
    Field names mirror `ExecResult` on purpose so call sites written against
    the old `docker_service.compile()` (`.exit_code`/`.stdout`/`.stderr`)
    barely change -- `.diagnostics` is simply new."""

    exit_code: int
    stdout: str
    stderr: str
    diagnostics: list[Diagnostic] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.exit_code == 0


@dataclass
class RunResult:
    """Outcome of the simulate step -- same shape as `CompileResult`, kept as
    a distinct type since a run's diagnostics (runtime `$error`/`$fatal`,
    assertion failures) are semantically different from compile errors even
    though they share the `Diagnostic` shape."""

    exit_code: int
    stdout: str
    stderr: str
    diagnostics: list[Diagnostic] = field(default_factory=list)


class SimulatorAdapter(ABC):
    """Contract every HDL simulation engine (Icarus, Verilator, and future
    GHDL/ModelSim/Vivado adapters) must implement.

    Subclasses only need to provide the "pure" pieces -- how to build a
    command and how to parse that engine's own diagnostic format. The
    `compile`/`run`/`lint` orchestration methods are shared here so every
    adapter executes through `DockerService` and returns the same
    `CompileResult`/`RunResult` shape identically.
    """

    #: Stable id matching `ProjectExecutionPayload.execution.simulator` and
    #: `SimulatorFactory`'s registry key (e.g. "iverilog", "verilator").
    id: str
    #: Human-readable name for logs/UI.
    display_name: str

    # -- pure command/parsing pieces (implemented per engine) ----------------

    @abstractmethod
    def required_compiler_flags(self) -> list[str]:
        """Flags this engine always needs for a correct compile, independent
        of anything the caller/payload supplies (e.g. Verilator's
        `--binary --timing`). Always applied first; caller-supplied
        `compiler_args` are appended after these, never replace them."""

    @abstractmethod
    def supported_waveform_formats(self) -> list[str]:
        """Waveform formats this engine can emit (e.g. `["vcd"]`)."""

    @abstractmethod
    def waveform_compile_flags(self, waveform_format: str) -> list[str]:
        """Extra compile flags needed to make this engine actually emit a
        waveform in `waveform_format` (e.g. Verilator's `--trace`). Icarus
        needs none -- its testbenches call `$dumpfile`/`$dumpvars` themselves.
        Raises `ValueError` if `waveform_format` isn't in
        `supported_waveform_formats()`."""

    @abstractmethod
    def build_compile_command(
        self,
        compile_paths: list[str],
        compiler_args: list[str],
        *,
        top_module: str | None = None,
        waveform_enabled: bool = False,
        waveform_format: str = "vcd",
    ) -> str:
        """Builds the shell-argv-splittable compile command string. Never
        executes anything -- pure string construction, unit-testable without
        Docker."""

    @abstractmethod
    def build_run_command(self) -> str:
        """Builds the command that executes whatever `build_compile_command`
        produced. Icarus needs a separate interpreter (`vvp`); Verilator's
        `--binary` output is already a native executable."""

    def build_lint_command(self, compile_paths: list[str]) -> str:
        """Builds a lint-only (elaborate/check, never run) command, for
        engines that support one. Default: unsupported -- overridden by
        engines with a real lint-only mode (Verilator's `--lint-only`)."""

        raise NotImplementedError(f"'{self.id}' does not support standalone lint")

    @abstractmethod
    def parse_compiler_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        """Turns this engine's raw compile-stage stdout/stderr into
        structured `Diagnostic`s (file/line/column/severity/message/code)."""

    @abstractmethod
    def parse_runtime_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        """Same as `parse_compiler_output`, but for the *run* stage -- e.g.
        Verilator's runtime `%Error`/`%Warning` from `$error`/`$fatal`/
        assertions. Most engines' normal `$display` output isn't a
        diagnostic at all, so this commonly returns `[]`."""

    # -- shared orchestration (never overridden) ------------------------------

    def compile(
        self,
        docker_service: "DockerService",
        container: "Container",
        compile_paths: list[str],
        compiler_args: list[str],
        *,
        top_module: str | None = None,
        waveform_enabled: bool = False,
        waveform_format: str = "vcd",
    ) -> CompileResult:
        """Builds and runs the compile command, parsing its output into
        diagnostics. `DockerService` only ever sees the resulting command
        string -- it has no idea which engine built it."""

        command = self.build_compile_command(
            compile_paths,
            compiler_args,
            top_module=top_module,
            waveform_enabled=waveform_enabled,
            waveform_format=waveform_format,
        )
        result: "ExecResult" = docker_service.run_command(container, command)
        diagnostics = self.parse_compiler_output(result.stdout, result.stderr)
        return CompileResult(exit_code=result.exit_code, stdout=result.stdout, stderr=result.stderr, diagnostics=diagnostics)

    def run(self, docker_service: "DockerService", container: "Container") -> RunResult:
        command = self.build_run_command()
        result: "ExecResult" = docker_service.run_command(container, command)
        diagnostics = self.parse_runtime_output(result.stdout, result.stderr)
        return RunResult(exit_code=result.exit_code, stdout=result.stdout, stderr=result.stderr, diagnostics=diagnostics)

    def lint(self, docker_service: "DockerService", container: "Container", compile_paths: list[str]) -> CompileResult:
        """Elaborate/check without producing a runnable binary. Not part of
        the `/execute` pipeline today (the standalone `/api/v1/lint` REST
        endpoint has its own on-disk-workspace Verilator invocation -- see
        `app/diagnostics/verilator.py`); exposed here so a container-based
        lint step is a one-line addition later, and so every adapter honors
        the same four-verb contract."""

        command = self.build_lint_command(compile_paths)
        result: "ExecResult" = docker_service.run_command(container, command)
        diagnostics = self.parse_compiler_output(result.stdout, result.stderr)
        return CompileResult(exit_code=result.exit_code, stdout=result.stdout, stderr=result.stderr, diagnostics=diagnostics)
