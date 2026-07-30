"""Symbol Cache data model.

These dataclasses are the reusable, tool-agnostic shape the rest of the
system (REST responses, and any future custom HDL feature) reads. They are
populated by `app/indexer/surelog.py` but nothing else needs to know that --
a future indexer (e.g. for VHDL) could populate the same cache shape.
"""

import time
from dataclasses import dataclass, field


@dataclass
class SourceLocation:
    file: str  # workspace-relative path
    line: int
    column: int = 0


@dataclass
class Parameter:
    name: str
    default_value: str | None
    location: SourceLocation


@dataclass
class Port:
    name: str
    direction: str  # "input" | "output" | "inout"
    packed_dimensions: str | None = None


@dataclass
class Signal:
    name: str
    kind: str  # "wire" | "reg" | "logic" | ...
    location: SourceLocation | None = None


@dataclass
class FunctionSymbol:
    name: str
    kind: str  # "function" | "task"
    location: SourceLocation


@dataclass
class ModuleSymbol:
    name: str
    location: SourceLocation
    ports: list[Port] = field(default_factory=list)
    parameters: list[Parameter] = field(default_factory=list)
    signals: list[Signal] = field(default_factory=list)
    functions: list[FunctionSymbol] = field(default_factory=list)


@dataclass
class PackageSymbol:
    name: str
    location: SourceLocation
    parameters: list[Parameter] = field(default_factory=list)
    functions: list[FunctionSymbol] = field(default_factory=list)


@dataclass
class InstanceNode:
    """One node of the elaborated instance hierarchy (a module instantiated
    inside another). `children` lets callers walk the full instance tree
    without re-deriving it from the flat module list."""

    instance_name: str
    module_name: str
    location: SourceLocation | None = None
    children: list["InstanceNode"] = field(default_factory=list)


@dataclass
class WorkspaceIndex:
    """Everything `indexer/surelog.py` produced for one project, cached by
    `cache/symbol_cache.py` until the next reindex."""

    project_id: str
    modules: dict[str, ModuleSymbol] = field(default_factory=dict)
    packages: dict[str, PackageSymbol] = field(default_factory=dict)
    instance_tree: list[InstanceNode] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    indexed_at: float = field(default_factory=time.time)
