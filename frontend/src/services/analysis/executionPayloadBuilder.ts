import {
  AnalysisWarning,
  CandidateEntry,
  DependencyEdgeType,
  DependencyGraph,
  ExecutionConfig,
  FileCategory,
  FilesDictionary,
  PayloadDependencyGraph,
  PayloadRelationshipType,
  PayloadWarning,
  RankedCandidate,
  WorkspaceFile,
} from "./types";

const CATEGORY_PREFIXES: Record<FileCategory, string> = {
  rtl: "rtl",
  testbench: "tb",
  include: "inc",
  constraints: "con",
  scripts: "scr",
  documentation: "doc",
  unknown: "misc",
};

/** Assigns stable, meaningful, category-prefixed ids ("rtl_001", "tb_001", ...).
 * Sorted alphabetically within each category before numbering so re-running
 * analysis on an unchanged workspace reproduces the same ids -- important once
 * a backend starts referencing these across runs. */
export function assignFileIds(entries: { relativePath: string; category: FileCategory }[]): Map<string, string> {
  const byCategory = new Map<FileCategory, string[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry.relativePath);
    byCategory.set(entry.category, list);
  }

  const idByPath = new Map<string, string>();
  for (const [category, paths] of byCategory) {
    const prefix = CATEGORY_PREFIXES[category];
    [...paths].sort().forEach((path, index) => {
      idByPath.set(path, `${prefix}_${String(index + 1).padStart(3, "0")}`);
    });
  }
  return idByPath;
}

export function buildFilesDictionary(files: WorkspaceFile[], contentByPath: Map<string, string>): FilesDictionary {
  const dictionary: FilesDictionary = {};
  for (const file of files) {
    dictionary[file.fileId] = {
      path: file.relativePath,
      extension: file.extension,
      language: file.language,
      category: file.category,
      size: file.size,
      modifiedAt: file.modifiedAt,
      content: contentByPath.get(file.relativePath) ?? "",
    };
  }
  return dictionary;
}

/** Resolved references translate to their fileId; unresolved ones (an include
 * or instantiation target that doesn't exist in the workspace) have no id to
 * translate to, so the raw name is kept as-is for visibility. */
function toFileId(pathToFileId: Map<string, string>, path: string): string {
  return pathToFileId.get(path) ?? path;
}

const RELATIONSHIP_TYPE_MAP: Record<DependencyEdgeType, PayloadRelationshipType> = {
  instantiation: "instantiates",
  include: "includes",
  "package-use": "imports",
};

export function toPayloadDependencyGraph(graph: DependencyGraph, pathToFileId: Map<string, string>): PayloadDependencyGraph {
  return {
    nodes: graph.nodes.map((node) => toFileId(pathToFileId, node)),
    edges: graph.edges.map((edge) => ({
      from: toFileId(pathToFileId, edge.from),
      to: toFileId(pathToFileId, edge.to),
      type: RELATIONSHIP_TYPE_MAP[edge.type],
      resolved: edge.resolved,
    })),
  };
}

export function toCandidateEntries(candidates: RankedCandidate[], pathToFileId: Map<string, string>): CandidateEntry[] {
  return candidates.map((c) => ({
    fileId: toFileId(pathToFileId, c.relativePath),
    name: c.name,
    score: c.score,
    reasons: c.reasons,
  }));
}

export function toPayloadWarnings(warnings: AnalysisWarning[], pathToFileId: Map<string, string>): PayloadWarning[] {
  return warnings.map((w) => ({
    severity: w.severity,
    code: w.code,
    message: w.message,
    relatedFiles: w.relatedFiles.map((path) => toFileId(pathToFileId, path)),
  }));
}

export function toCompilationOrderIds(order: string[], pathToFileId: Map<string, string>): string[] {
  return order.map((path) => toFileId(pathToFileId, path));
}

const EXECUTION_DEFAULTS = {
  workingDirectory: "/workspace",
  waveform: { enabled: true, format: "vcd" as const },
};

/** Picks sensible run defaults (highest-ranked candidates) the way an IDE
 * would pre-select a top module -- still fully overridable later, since the
 * ranked candidate lists that produced this choice travel in `analysis` too.
 *
 * `simulatorId` comes from the caller (settingsStore's `defaultCompiler`) --
 * this function no longer hardcodes an engine. `compilerArgs` defaults to
 * `[]`: each backend SimulatorAdapter supplies its own required flags
 * (e.g. iverilog's `-g2012`, Verilator's `--binary --timing`) automatically,
 * so the frontend doesn't need engine-specific knowledge to build a working
 * payload -- see app/services/simulators/base.py's `required_compiler_flags`. */
export function buildExecutionConfig(
  topModules: CandidateEntry[],
  testbenches: CandidateEntry[],
  compileFiles: string[],
  selectedTestbenchName: string | null | undefined,
  simulatorId: string,
  mode: "simulate" | "lint" = "simulate"
): ExecutionConfig {
  return {
    // Lint-only mode only exists on VerilatorAdapter (see backend's
    // app/api/execute.py, which 400s any other engine) -- force it here
    // rather than at every "Continue Without Testbench" call site.
    simulator: mode === "lint" ? "verilator" : simulatorId,
    topModule: topModules[0]?.name ?? null,
    testbench: selectedTestbenchName !== undefined ? selectedTestbenchName : (testbenches[0]?.name ?? null),
    compilerArgs: [],
    workingDirectory: EXECUTION_DEFAULTS.workingDirectory,
    // Lint mode never reaches the backend's waveform-collection step at
    // all, but disabling it here too keeps the payload self-consistent.
    waveform: mode === "lint" ? { enabled: false, format: EXECUTION_DEFAULTS.waveform.format } : { ...EXECUTION_DEFAULTS.waveform },
    compileFiles,
    mode,
  };
}
