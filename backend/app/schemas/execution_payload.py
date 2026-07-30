"""Pydantic mirror of the frontend's `ProjectExecutionPayload` (see
frontend/src/services/analysis/types.ts). The worker treats this payload as
the sole source of truth for the project -- it never re-scans a real
filesystem, it only ever reads what's here.
"""

from __future__ import annotations

from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceTreeFile(BaseModel):
    kind: Literal["file"]
    id: str
    name: str
    path: str


class WorkspaceTreeFolder(BaseModel):
    kind: Literal["folder"]
    name: str
    path: str
    children: list["WorkspaceTreeNode"]


WorkspaceTreeNode = Union[WorkspaceTreeFolder, WorkspaceTreeFile]
WorkspaceTreeFolder.model_rebuild()


class ProjectInfo(BaseModel):
    id: str | None
    name: str
    root: str
    language: str


class WorkspaceInfo(BaseModel):
    version: int
    tabId: str
    tree: WorkspaceTreeNode


class FileEntry(BaseModel):
    path: str
    extension: str
    language: str
    category: str
    size: int
    modifiedAt: int
    content: str


class DependencyEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    type: str
    resolved: bool


class DependencyGraph(BaseModel):
    nodes: list[str]
    edges: list[DependencyEdge]


class CandidateEntry(BaseModel):
    fileId: str
    name: str
    score: int
    reasons: list[str]


class AnalysisWarning(BaseModel):
    severity: str
    code: str
    message: str
    relatedFiles: list[str]


class AnalysisInfo(BaseModel):
    topModules: list[CandidateEntry]
    testbenches: list[CandidateEntry]
    dependencyGraph: DependencyGraph
    compilationOrder: list[str]
    warnings: list[AnalysisWarning]


class WaveformConfig(BaseModel):
    enabled: bool
    format: str


class ExecutionConfig(BaseModel):
    simulator: str
    topModule: str | None
    testbench: str | None
    compilerArgs: list[str] = Field(default_factory=list)
    workingDirectory: str
    waveform: WaveformConfig
    compileFiles: list[str] = Field(default_factory=list)
    # "lint": elaborate/syntax-check only (adapter.lint(), see ExecutionManager)
    # -- never runs a simulation, never produces a waveform. Defaults to
    # "simulate" so every payload built before this field existed still
    # parses to today's exact behavior.
    mode: Literal["simulate", "lint"] = "simulate"


class ProjectExecutionPayload(BaseModel):
    """The complete, self-sufficient payload the worker reconstructs a project
    from. Exactly six top-level keys, matching the frontend 1:1 -- no
    filesystem scan, no re-analysis, ever happens on this side."""

    schemaVersion: str
    project: ProjectInfo
    workspace: WorkspaceInfo
    files: dict[str, FileEntry]
    analysis: AnalysisInfo
    execution: ExecutionConfig
