"""Simulator abstraction layer -- see `base.py` for the adapter contract and
`factory.py` for how `execution.simulator` ids resolve to an adapter."""

from app.services.simulators.base import CompileResult, RunResult, SimulatorAdapter
from app.services.simulators.factory import DEFAULT_SIMULATOR_ID, SimulatorFactory

__all__ = [
    "CompileResult",
    "RunResult",
    "SimulatorAdapter",
    "SimulatorFactory",
    "DEFAULT_SIMULATOR_ID",
]
