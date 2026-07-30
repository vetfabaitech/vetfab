import { create } from "zustand";
import { useExplorerStore } from "@/store/explorerStore";
import { useSettingsStore } from "@/store/settingsStore";
import { extname } from "@/utils/format";
import { delay } from "@/utils/async";
import { scanWorkspace } from "./workspaceScanner";
import { buildWorkspaceTree } from "./workspaceTreeBuilder";
import { classifyFile, inferLanguage } from "./fileClassifier";
import { parseHdlFile } from "./hdlParser";
import { buildDependencyGraph, detectTestbenchCandidates, detectTopModuleCandidates } from "./dependencyAnalyzer";
import { generateCompilationOrder } from "./compilationOrderGenerator";
import { validateWorkspace } from "./workspaceValidator";
import {
  assignFileIds,
  buildExecutionConfig,
  buildFilesDictionary,
  toCandidateEntries,
  toCompilationOrderIds,
  toPayloadDependencyGraph,
  toPayloadWarnings,
} from "./executionPayloadBuilder";
import { AnalysisStage, HdlFileAnalysis, ProjectExecutionPayload, WorkspaceFile } from "./types";

const SCHEMA_VERSION = "1.0.0";

interface AnalysisState {
  stage: AnalysisStage;
  error: string | null;
  payload: ProjectExecutionPayload | null;
  workspaceVersion: number;
  /** Explorer node id of the testbench the user explicitly picked to run --
   * null means "auto-pick the highest-ranked candidate". Compiling/running
   * exactly one testbench (instead of every testbench-category file) is what
   * keeps the resulting waveform unambiguous: one simulation, one dumpfile. */
  selectedTestbenchId: string | null;
  reset: () => void;
  setSelectedTestbenchId: (id: string | null) => void;
  /** `testbenchOverrideId`: omit (undefined) to use the store's own
   * `selectedTestbenchId` (i.e. whatever TestbenchSelector has picked); pass
   * an explicit id (or null for "auto") to override it for just this one
   * call without disturbing the persisted UI selection -- this is what lets
   * "Run All" iterate every testbench without fighting the dropdown. */
  runAnalysis: (
    tabId: string,
    language: string,
    testbenchOverrideId?: string | null,
    mode?: "simulate" | "lint"
  ) => Promise<void>;
}

/** Owns analysis pipeline progress/result state, independent of the explorer
 * store it reads from and the UI that renders it. */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  stage: "idle",
  error: null,
  payload: null,
  workspaceVersion: 0,
  selectedTestbenchId: null,

  reset: () => set({ stage: "idle", error: null, payload: null }),
  setSelectedTestbenchId: (id) => set({ selectedTestbenchId: id }),

  runAnalysis: async (tabId, language, testbenchOverrideId, mode = "simulate") => {
    if (get().stage !== "idle" && get().stage !== "ready" && get().stage !== "error") return;

    set({ stage: "reading-workspace", error: null, payload: null });
    try {
      const { nodes, rootId, workspaceName } = useExplorerStore.getState();
      const { files: rawFiles, folders: rawFolders } = scanWorkspace(nodes, rootId);
      await delay(180);

      set({ stage: "scanning-files" });
      const contentByPath = new Map<string, string>();
      const categoryByPath = new Map<string, WorkspaceFile["category"]>();
      let skipped = 0;
      for (const raw of rawFiles) {
        const ext = extname(raw.name);
        const category = classifyFile(raw.relativePath, ext);
        if (category === null) {
          skipped += 1;
          continue;
        }
        categoryByPath.set(raw.relativePath, category);
        contentByPath.set(raw.relativePath, raw.node.content ?? "");
      }
      const pathToFileId = assignFileIds(
        Array.from(categoryByPath, ([relativePath, category]) => ({ relativePath, category }))
      );
      const scanned: WorkspaceFile[] = rawFiles
        .filter((raw) => categoryByPath.has(raw.relativePath))
        .map((raw) => ({
          id: raw.id,
          fileId: pathToFileId.get(raw.relativePath) as string,
          name: raw.name,
          relativePath: raw.relativePath,
          extension: extname(raw.name),
          depth: raw.depth,
          size: raw.node.size,
          modifiedAt: raw.node.modifiedAt,
          category: categoryByPath.get(raw.relativePath) as WorkspaceFile["category"],
          language: inferLanguage(extname(raw.name)),
        }));
      await delay(180);

      set({ stage: "building-workspace-tree" });
      const tree = buildWorkspaceTree(workspaceName, rawFiles, rawFolders, pathToFileId);
      await delay(180);

      set({ stage: "analyzing-hdl-files" });
      const analysisByPath = new Map<string, HdlFileAnalysis>();
      for (const file of scanned) {
        if (file.language === "verilog" || file.language === "systemverilog" || file.language === "vhdl") {
          analysisByPath.set(file.relativePath, parseHdlFile(file.relativePath, contentByPath.get(file.relativePath) ?? "", file.language));
        }
      }
      await delay(220);

      set({ stage: "building-dependency-graph" });
      const graph = buildDependencyGraph(scanned, analysisByPath);
      const topModuleCandidates = detectTopModuleCandidates(scanned, analysisByPath, graph);
      const testbenchCandidates = detectTestbenchCandidates(scanned, analysisByPath, graph);
      await delay(220);

      set({ stage: "determining-compilation-order" });
      const compileRelevantPaths = scanned
        .filter((f) => f.category === "rtl" || f.category === "testbench" || f.category === "include")
        .map((f) => f.relativePath);
      const compilationOrder = generateCompilationOrder(graph, compileRelevantPaths);
      await delay(180);

      set({ stage: "validating-workspace" });
      const warnings = validateWorkspace(scanned, analysisByPath, graph, topModuleCandidates, testbenchCandidates, skipped);
      await delay(180);

      set({ stage: "generating-payload" });
      const topModules = toCandidateEntries(topModuleCandidates, pathToFileId);
      const testbenches = toCandidateEntries(testbenchCandidates, pathToFileId);
      const compilationOrderIds = toCompilationOrderIds(compilationOrder, pathToFileId);

      // Exactly one testbench compiles/runs per execution -- never all of them --
      // so the produced waveform always corresponds unambiguously to one simulation.
      const selectedTestbenchId = testbenchOverrideId !== undefined ? testbenchOverrideId : get().selectedTestbenchId;
      const chosenTestbenchFile =
        (selectedTestbenchId && scanned.find((f) => f.id === selectedTestbenchId && f.category === "testbench")) ||
        scanned.find((f) => f.relativePath === testbenchCandidates[0]?.relativePath);
      const chosenTestbenchName = chosenTestbenchFile
        ? (analysisByPath.get(chosenTestbenchFile.relativePath)?.modules[0]?.name ?? chosenTestbenchFile.name)
        : null;

      const rtlFileIds = new Set(scanned.filter((f) => f.category === "rtl").map((f) => f.fileId));
      const compileFiles = [
        ...compilationOrderIds.filter((id) => rtlFileIds.has(id)),
        ...(chosenTestbenchFile ? [chosenTestbenchFile.fileId] : []),
      ];
      const nextVersion = get().workspaceVersion + 1;

      const payload: ProjectExecutionPayload = {
        schemaVersion: SCHEMA_VERSION,
        project: {
          id: null,
          name: workspaceName,
          root: workspaceName,
          language,
        },
        workspace: {
          version: nextVersion,
          tabId,
          tree,
        },
        files: buildFilesDictionary(scanned, contentByPath),
        analysis: {
          topModules,
          testbenches,
          dependencyGraph: toPayloadDependencyGraph(graph, pathToFileId),
          compilationOrder: compilationOrderIds,
          warnings: toPayloadWarnings(warnings, pathToFileId),
        },
        execution: buildExecutionConfig(
          topModules,
          testbenches,
          compileFiles,
          chosenTestbenchName,
          useSettingsStore.getState().defaultCompiler,
          mode
        ),
      };
      await delay(180);

      set({ stage: "ready", payload, workspaceVersion: nextVersion });
    } catch (err) {
      set({ stage: "error", error: err instanceof Error ? err.message : "Analysis failed" });
    }
  },
}));
