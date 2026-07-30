export type FileCategory =
  | "rtl"
  | "testbench"
  | "include"
  | "constraints"
  | "scripts"
  | "documentation"
  | "unknown";

export type HdlLanguageKind = "verilog" | "systemverilog" | "vhdl" | "other";

/** Metadata-only view of a file used internally while scanning/classifying/
 * validating. `fileId` is the meaningful, category-prefixed id (e.g. "rtl_001")
 * that becomes the file's key in the payload's `files` dictionary and the
 * only thing other payload sections (tree, dependency graph, warnings,
 * candidates) reference -- paths never appear twice in the final payload. */
export interface WorkspaceFile {
  id: string;
  fileId: string;
  name: string;
  relativePath: string;
  extension: string;
  depth: number;
  size: number;
  modifiedAt: number;
  category: FileCategory;
  language: HdlLanguageKind;
}

export interface PortInfo {
  name: string;
  direction: "input" | "output" | "inout" | "unknown";
  width?: string;
}

export interface ParameterInfo {
  name: string;
  defaultValue?: string;
}

export interface ModuleInfo {
  kind: "module" | "entity" | "interface" | "program";
  name: string;
  ports: PortInfo[];
  parameters: ParameterInfo[];
}

export interface ArchitectureInfo {
  name: string;
  entityName: string;
}

export interface PackageInfo {
  name: string;
}

export interface InstantiationInfo {
  instanceName: string;
  ofModule: string;
}

export interface SimulationHints {
  hasFinish: boolean;
  hasDumpfile: boolean;
  hasInitialBlock: boolean;
  hasDisplay: boolean;
}

export interface HdlFileAnalysis {
  relativePath: string;
  language: HdlLanguageKind;
  modules: ModuleInfo[];
  architectures: ArchitectureInfo[];
  packages: PackageInfo[];
  tasks: string[];
  functions: string[];
  generateBlockCount: number;
  includeDirectives: string[];
  timescale?: string;
  instantiations: InstantiationInfo[];
  packageImports: string[];
  simulationHints: SimulationHints;
}

/** Internal (path-keyed) dependency representation -- easy to compute from
 * regex analysis. Translated to id-keyed form only at final payload assembly. */
export type DependencyEdgeType = "instantiation" | "include" | "package-use";

export interface DependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeType;
  resolved: boolean;
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export interface RankedCandidate {
  relativePath: string;
  name: string;
  score: number;
  reasons: string[];
}

export type WarningSeverity = "warning" | "info";

export interface AnalysisWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  relatedFiles: string[];
}

// ---------------------------------------------------------------------------
// Payload-facing types -- exactly the shape transmitted to the backend later.
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  id: string | null;
  name: string;
  root: string;
  language: string;
}

export type WorkspaceTreeNode =
  | { kind: "folder"; name: string; path: string; children: WorkspaceTreeNode[] }
  | { kind: "file"; id: string; name: string; path: string };

export interface WorkspaceInfo {
  version: number;
  tabId: string;
  tree: WorkspaceTreeNode;
}

export interface FileEntry {
  path: string;
  extension: string;
  language: HdlLanguageKind;
  category: FileCategory;
  size: number;
  modifiedAt: number;
  content: string;
}

export type FilesDictionary = Record<string, FileEntry>;

export type PayloadRelationshipType = "instantiates" | "includes" | "imports";

export interface PayloadDependencyEdge {
  from: string;
  to: string;
  type: PayloadRelationshipType;
  resolved: boolean;
}

export interface PayloadDependencyGraph {
  nodes: string[];
  edges: PayloadDependencyEdge[];
}

export interface CandidateEntry {
  fileId: string;
  name: string;
  score: number;
  reasons: string[];
}

export interface PayloadWarning {
  severity: WarningSeverity;
  code: string;
  message: string;
  relatedFiles: string[];
}

export interface AnalysisInfo {
  topModules: CandidateEntry[];
  testbenches: CandidateEntry[];
  dependencyGraph: PayloadDependencyGraph;
  compilationOrder: string[];
  warnings: PayloadWarning[];
}

export interface WaveformConfig {
  enabled: boolean;
  format: "vcd" | "fst";
}

export interface ExecutionConfig {
  simulator: string;
  topModule: string | null;
  testbench: string | null;
  compilerArgs: string[];
  workingDirectory: string;
  waveform: WaveformConfig;
  /** File ids to pass to the compiler, in dependency order -- derived from
   * analysis.compilationOrder filtered to design/testbench categories (include
   * files aren't standalone compilation units). */
  compileFiles: string[];
  /** "lint": elaborate/syntax-check only (backend's adapter.lint(), see
   * ExecutionManager) -- never runs a simulation, never produces a waveform.
   * Verilator-only today (see buildExecutionConfig, which forces
   * simulator:"verilator" whenever mode is "lint"). */
  mode: "simulate" | "lint";
}

/** The complete, self-sufficient payload a backend worker will later
 * reconstruct the whole project from. Exactly six top-level keys by design --
 * no information is duplicated across them (paths live only in `files` and
 * `workspace.tree`, metadata only in `files`, relationships only in
 * `analysis`, run configuration only in `execution`). */
export interface ProjectExecutionPayload {
  schemaVersion: string;
  project: ProjectInfo;
  workspace: WorkspaceInfo;
  files: FilesDictionary;
  analysis: AnalysisInfo;
  execution: ExecutionConfig;
}

export type AnalysisStage =
  | "idle"
  | "reading-workspace"
  | "scanning-files"
  | "building-workspace-tree"
  | "analyzing-hdl-files"
  | "building-dependency-graph"
  | "determining-compilation-order"
  | "validating-workspace"
  | "generating-payload"
  | "ready"
  | "error";
