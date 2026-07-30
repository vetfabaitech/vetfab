"""Request/response schemas for POST /reindex, GET /symbols, GET /hierarchy.

Mirrors the dataclasses in `app/models/symbol.py` -- kept as a separate,
parallel set of Pydantic models (rather than making the cache's dataclasses
themselves Pydantic) so the Symbol Cache stays a plain, framework-agnostic
Python structure reusable by future non-HTTP consumers.
"""

from __future__ import annotations

from pydantic import BaseModel


class SourceLocationSchema(BaseModel):
    file: str
    line: int
    column: int = 0


class ParameterSchema(BaseModel):
    name: str
    defaultValue: str | None
    location: SourceLocationSchema


class PortSchema(BaseModel):
    name: str
    direction: str
    packedDimensions: str | None = None


class SignalSchema(BaseModel):
    name: str
    kind: str
    location: SourceLocationSchema | None = None


class FunctionSymbolSchema(BaseModel):
    name: str
    kind: str
    location: SourceLocationSchema


class ModuleSymbolSchema(BaseModel):
    name: str
    location: SourceLocationSchema
    ports: list[PortSchema]
    parameters: list[ParameterSchema]
    signals: list[SignalSchema]
    functions: list[FunctionSymbolSchema]


class PackageSymbolSchema(BaseModel):
    name: str
    location: SourceLocationSchema
    parameters: list[ParameterSchema]
    functions: list[FunctionSymbolSchema]


class InstanceNodeSchema(BaseModel):
    instanceName: str
    moduleName: str
    location: SourceLocationSchema | None = None
    children: list["InstanceNodeSchema"] = []


InstanceNodeSchema.model_rebuild()


class ReindexRequest(BaseModel):
    projectId: str


class ReindexResponse(BaseModel):
    projectId: str
    moduleCount: int
    packageCount: int
    errorCount: int
    indexedAt: float


class SymbolsResponse(BaseModel):
    projectId: str
    modules: list[ModuleSymbolSchema]
    packages: list[PackageSymbolSchema]
    indexedAt: float


class HierarchyResponse(BaseModel):
    projectId: str
    instanceTree: list[InstanceNodeSchema]
    indexedAt: float
