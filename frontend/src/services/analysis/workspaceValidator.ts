import { detectCircularDependencies } from "./dependencyAnalyzer";
import { AnalysisWarning, DependencyGraph, HdlFileAnalysis, RankedCandidate, WorkspaceFile } from "./types";

export function validateWorkspace(
  files: WorkspaceFile[],
  analysisByPath: Map<string, HdlFileAnalysis>,
  graph: DependencyGraph,
  topModuleCandidates: RankedCandidate[],
  testbenchCandidates: RankedCandidate[],
  skippedCount: number
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  const moduleOwners = new Map<string, string[]>();
  for (const [path, analysis] of analysisByPath) {
    for (const mod of analysis.modules) {
      const list = moduleOwners.get(mod.name) ?? [];
      list.push(path);
      moduleOwners.set(mod.name, list);
    }
  }
  for (const [name, owners] of moduleOwners) {
    if (owners.length > 1) {
      warnings.push({
        severity: "warning",
        code: "duplicate-module-name",
        message: `Module/entity "${name}" is defined in ${owners.length} files`,
        relatedFiles: owners,
      });
    }
  }

  const nameOwners = new Map<string, string[]>();
  for (const file of files) {
    const list = nameOwners.get(file.name) ?? [];
    list.push(file.relativePath);
    nameOwners.set(file.name, list);
  }
  for (const [name, owners] of nameOwners) {
    if (owners.length > 1) {
      warnings.push({
        severity: "info",
        code: "duplicate-filename",
        message: `Filename "${name}" appears in ${owners.length} locations`,
        relatedFiles: owners,
      });
    }
  }

  for (const file of files) {
    if (file.size === 0) {
      warnings.push({
        severity: "warning",
        code: "empty-file",
        message: `"${file.relativePath}" is empty`,
        relatedFiles: [file.relativePath],
      });
    }
  }

  for (const edge of graph.edges) {
    if (edge.resolved) continue;
    if (edge.type === "include") {
      warnings.push({
        severity: "warning",
        code: "missing-include",
        message: `"${edge.from}" includes "${edge.to}" which was not found in the workspace`,
        relatedFiles: [edge.from],
      });
    } else if (edge.type === "instantiation") {
      warnings.push({
        severity: "info",
        code: "unresolved-instantiation",
        message: `"${edge.from}" instantiates "${edge.to}" which was not found in the workspace (may be an external/IP module)`,
        relatedFiles: [edge.from],
      });
    } else {
      warnings.push({
        severity: "info",
        code: "unresolved-package",
        message: `"${edge.from}" imports package "${edge.to}" which was not found in the workspace`,
        relatedFiles: [edge.from],
      });
    }
  }

  for (const cycle of detectCircularDependencies(graph)) {
    warnings.push({
      severity: "warning",
      code: "circular-dependency",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      relatedFiles: cycle,
    });
  }

  if (skippedCount > 0) {
    warnings.push({
      severity: "info",
      code: "unsupported-extensions-skipped",
      message: `${skippedCount} file(s) with unsupported extensions were ignored during analysis`,
      relatedFiles: [],
    });
  }

  if (topModuleCandidates.length === 0) {
    warnings.push({
      severity: "warning",
      code: "missing-top-module",
      message: "No top module candidate could be identified in this workspace",
      relatedFiles: [],
    });
  }

  if (testbenchCandidates.length === 0) {
    warnings.push({
      severity: "warning",
      code: "missing-testbench",
      message: "No testbench candidate could be identified in this workspace",
      relatedFiles: [],
    });
  }

  return warnings;
}
