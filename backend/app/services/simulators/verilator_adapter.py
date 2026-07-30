"""Verilator adapter -- the new default simulation engine.

Uses Verilator's `--binary` workflow (the modern, "traditional testbench
compatible" mode Verilator 4.2+/5.x recommends for exactly this kind of
migration): one invocation elaborates the design, generates C++, builds it
with `make`, and links a self-contained native executable -- no `vvp`-style
bytecode interpreter, no hand-written C++ `main()`, and (combined with
`--timing`) it tolerates the same `#delay`-based testbenches Icarus does.

Waveform generation reuses the testbench's own `$dumpfile`/`$dumpvars`
calls exactly as Icarus does -- Verilator has supported those system tasks
under `--trace` since 4.2, specifically for this kind of source-compatible
migration. No testbench source changes are required.
"""

from __future__ import annotations

from app.models.diagnostic import Diagnostic
from app.services.simulators.base import SimulatorAdapter
from app.utils.verilator_diagnostics import parse_verilator_diagnostics

# Verilator places every generated file (Makefile, .cpp/.o, and the final
# binary) under --Mdir; keeping that as its own subdirectory (rather than
# the workspace root, which is where Icarus's own sim.out lives) keeps
# build byproducts clearly separated from source files and from whatever
# waveform the testbench dumps at the workspace root.
_BUILD_DIR = "obj_dir"
_ARTIFACT_NAME = "sim.out"
_ARTIFACT_PATH = f"{_BUILD_DIR}/{_ARTIFACT_NAME}"


class VerilatorAdapter(SimulatorAdapter):
    id = "verilator"
    display_name = "Verilator"

    def required_compiler_flags(self) -> list[str]:
        return [
            "--binary",  # verilate + build + link a runnable executable in one step
            "-j",
            "2",  # bounded build parallelism -- the sandbox container is memory-limited (see DockerService)
            "--Mdir",
            _BUILD_DIR,
            "-o",
            _ARTIFACT_NAME,
            # Without this, any testbench using `#delay` (e.g. `always #5 clk <= ~clk;`)
            # hard-errors with NEEDTIMINGOPT -- see app/diagnostics/verilator.py, which
            # needed the same flag for the exact same reason.
            "--timing",
            # Verilator's default is to treat its own lint-style warnings
            # (e.g. TIMESCALEMOD -- one file has a `\timescale` and another
            # doesn't) as fatal and abort the whole run, unlike iverilog,
            # which only ever hard-fails on real errors. build_lint_command
            # below already runs with -Wno-fatal for the same reason (so
            # editor squiggles never block anything); Run needs the same
            # tolerance so a multi-file design with inconsistent style
            # across files can still simulate.
            "-Wno-fatal",
        ]

    def supported_waveform_formats(self) -> list[str]:
        return ["vcd", "fst"]

    def waveform_compile_flags(self, waveform_format: str) -> list[str]:
        if waveform_format == "vcd":
            return ["--trace"]
        if waveform_format == "fst":
            return ["--trace-fst"]
        raise ValueError(f"verilator does not support waveform format '{waveform_format}'")

    def build_compile_command(
        self,
        compile_paths: list[str],
        compiler_args: list[str],
        *,
        top_module: str | None = None,
        waveform_enabled: bool = False,
        waveform_format: str = "vcd",
    ) -> str:
        flags = [*self.required_compiler_flags(), *compiler_args]
        if waveform_enabled:
            flags += self.waveform_compile_flags(waveform_format)
        if top_module:
            # Elaboration root: pass the *testbench* module name (the thing
            # with the `initial`/`$dumpvars`/`$finish` blocks), not the RTL
            # design's own top -- ExecutionManager is responsible for
            # resolving that (see `_elaboration_top` there) before calling in.
            flags += ["--top-module", top_module]
        files = " ".join(compile_paths)
        return f"verilator {' '.join(flags)} {files}".replace("  ", " ").strip()

    def build_run_command(self) -> str:
        return _ARTIFACT_PATH

    def build_lint_command(self, compile_paths: list[str]) -> str:
        files = " ".join(compile_paths)
        return f"verilator --lint-only -Wall -Wno-fatal --timing -Wno-MULTITOP -Wno-TIMESCALEMOD -Wno-DECLFILENAME {files}".strip()

    def parse_compiler_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        del stdout  # Verilator's own diagnostics are always on stderr (matches app/diagnostics/verilator.py)
        return parse_verilator_diagnostics(stderr)

    def parse_runtime_output(self, stdout: str, stderr: str) -> list[Diagnostic]:
        del stdout  # `$display` output, not diagnostics
        # Runtime `$error`/`$fatal`/assertion failures use the same
        # "%Error:"/"%Warning:" convention as compile-time diagnostics.
        return parse_verilator_diagnostics(stderr)
