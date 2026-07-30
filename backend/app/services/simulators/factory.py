"""Simulator factory: the only place that maps an
`execution.simulator` id string to a concrete `SimulatorAdapter`.

Adding a future engine (GHDL, ModelSim, Vivado) is exactly: write a new
`SimulatorAdapter` subclass, register it in `_ADAPTERS` below. Nothing in
`ExecutionManager`, `ExecutionService`, or `DockerService` changes.
"""

from __future__ import annotations

from app.services.simulators.base import SimulatorAdapter
from app.services.simulators.iverilog_adapter import IcarusAdapter
from app.services.simulators.verilator_adapter import VerilatorAdapter
from app.utils.exceptions import UnsupportedSimulatorError

# Verilator is the default/primary engine as of this migration; Icarus
# remains registered for backward compatibility (see IcarusAdapter's
# docstring). Order here has no runtime effect beyond `available()`'s order.
_ADAPTERS: dict[str, type[SimulatorAdapter]] = {
    "verilator": VerilatorAdapter,
    "iverilog": IcarusAdapter,
}

DEFAULT_SIMULATOR_ID = "verilator"


class SimulatorFactory:
    """Resolves simulator ids to adapter instances. Stateless -- adapters
    themselves hold no per-job state, so a fresh instance per call is cheap
    and avoids any risk of cross-job state leaking."""

    @staticmethod
    def create(simulator_id: str | None) -> SimulatorAdapter:
        key = (simulator_id or "").strip().lower() or DEFAULT_SIMULATOR_ID
        adapter_cls = _ADAPTERS.get(key)
        if adapter_cls is None:
            raise UnsupportedSimulatorError(simulator_id or "", available=SimulatorFactory.available())
        return adapter_cls()

    @staticmethod
    def available() -> list[str]:
        return list(_ADAPTERS.keys())
