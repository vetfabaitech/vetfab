"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMonaco } from "@monaco-editor/react";
import Header from "@/components/Header";
import Sidebar from "@/components/Explorer/Sidebar";
import EditorTabBar from "@/components/Editor/EditorTabBar";
import MultiFileEditor from "@/components/Editor/MultiFileEditor";
import Terminal from "@/components/Terminal";
import ExecutionSummary from "@/components/ExecutionSummary";
import BottomPanel from "@/components/BottomPanel";
import WaveformPanel from "@/components/WaveformPanel";
import ResizableLayout from "@/components/ResizableLayout";
import CollapsibleRightPanel from "@/components/RightPanel/CollapsibleRightPanel";
import Toast from "@/components/Toast";
import StatusBar from "@/components/StatusBar";
import CommandPalette from "@/components/CommandPalette/CommandPalette";
import KeyboardShortcutsModal from "@/components/Help/KeyboardShortcutsModal";
import NoTestbenchDialog from "@/components/Toolbar/NoTestbenchDialog";
import { useStoresHydrated } from "@/hooks/useStoresHydrated";
import { useSyncThemeClass } from "@/hooks/useSyncThemeClass";
import { useProblems } from "@/hooks/useProblems";
import { useCompilerMarkers } from "@/hooks/useCompilerMarkers";
import { useIdeGlobalShortcuts } from "@/hooks/useIdeGlobalShortcuts";
import { editorManager } from "@/services/editor/EditorManager";
import { useEditorStore } from "@/store/editorStore";
import { flattenTreeForTerminal, useExplorerStore } from "@/store/explorerStore";
import { useSimulationStore } from "@/store/simulationStore";
import { useRightPanelStore } from "@/store/panelStore";
import { useCompileStatusStore } from "@/store/compileStatusStore";
import { useAnalysisStore } from "@/services/analysis/stateManager";
import { listTestbenchFiles } from "@/services/analysis/testbenchDiscovery";
import { findTopModuleForTestbenchGeneration, TopModuleForTestbench } from "@/services/workspace/testbenchGenerator";
import { HdlLanguage, LogEntry } from "@/lib/types";
import type { ProblemEntry } from "@/types/diagnostics";
import type { CompilerDiagnostic } from "@/services/diagnostics/compilerOutputParser";
import { getApiUrl, getWsUrl } from "@/lib/env";

const DEFAULT_RUN_TAB_ID = "design";

const API_URL = getApiUrl();
const PROJECT_ID = "local-project";

let logIdCounter = 0;
function nextLogId() {
  logIdCounter += 1;
  return `log-${logIdCounter}`;
}

function makeLog(text: string, level: LogEntry["level"] = "info"): LogEntry {
  return { id: nextLogId(), text, level, timestamp: Date.now() };
}

interface RunWsMessage {
  type: "log" | "output" | "result";
  message?: string;
  stream?: "compiler" | "stdout" | "stderr";
  text?: string;
  status?: "completed" | "failed" | "terminated";
  hasWaveform?: boolean;
  executionTimeMs?: number;
  // Structured diagnostics from whichever SimulatorAdapter ran the job (see
  // execution_manager.py's `_output`/`_finish`) -- present on the compiler
  // "output" message and, merged compile+runtime, on the final "result".
  diagnostics?: CompilerDiagnostic[];
  simulator?: string;
  // Only present on the final "result" message (see execution_manager.py's
  // _finish()) -- "lint" jobs never set buildTimeMs/runTimeMs's sibling
  // runExitCode, and buildTimeMs/runTimeMs are separate wall-clock phases,
  // not a split of executionTimeMs.
  mode?: "simulate" | "lint";
  buildTimeMs?: number | null;
  runTimeMs?: number | null;
  warningCount?: number;
  errorCount?: number;
}

/** `outputEntries` tags each line with which of the 3 output channels it
 * belongs in (see page render below) -- "simulation" is the running
 * program's own stdout ($display/$monitor/$write), "build" is everything
 * else (compiler/build-tool noise, run-phase stderr). Problems panel content
 * comes from Monaco markers, not this list -- see compilerMarkers.apply(). */
interface ChannelLogEntry extends LogEntry {
  channel: "simulation" | "build";
}

const SMALL_SCREEN_BREAKPOINT = 768;

/** Responsive behavior for the right panel (Feature 3): below this width the
 * Output/Waveform panel auto-collapses instead of squeezing into a stacked
 * column layout, handing its space to the editor -- see
 * `CollapsibleRightPanel`'s `forceCollapsed` prop. */
function useIsSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const update = () => setIsSmall(window.innerWidth < SMALL_SCREEN_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isSmall;
}

function IdeWorkspace() {
  const [language, setLanguage] = useState<HdlLanguage>("verilog");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  useSyncThemeClass();
  useIdeGlobalShortcuts({
    onOpenPalette: () => setIsPaletteOpen(true),
    onOpenShortcutHelp: () => setIsShortcutHelpOpen((v) => !v),
  });
  const editorActiveTabId = useEditorStore((s) => s.activeTabId);
  const [outputEntries, setOutputEntries] = useState<ChannelLogEntry[]>([
    { ...makeLog("Ready..."), channel: "simulation" },
    { ...makeLog('Press "Run" to execute.'), channel: "simulation" },
  ]);
  const [executionLogs, setExecutionLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  /** Drives the Execution Summary strip -- set from the final WS "result"
   * message (mode/status/counts/timing), independent of which BottomPanel
   * tab is active. Cleared at the start of every new Run so a stale
   * previous-run summary never lingers next to fresh output. */
  const [lastResult, setLastResult] = useState<{
    mode: "simulate" | "lint";
    status: "completed" | "failed" | "terminated";
    warningCount: number;
    errorCount: number;
    buildTimeMs: number | null;
    runTimeMs: number | null;
  } | null>(null);
  /** Set instead of running when Run/Run All find zero testbenches -- see
   * handleRun/handleRunAll. `topModule` is precomputed at the moment the
   * dialog opens (not recomputed inside its handlers) so Generate/Create
   * act on the exact same module the dialog described. */
  const [noTestbenchPrompt, setNoTestbenchPrompt] = useState<{
    mode: "run" | "runAll";
    topModule: TopModuleForTestbench | null;
  } | null>(null);
  // Mirrors `isRunning` so `handleRun`'s guard reads a value that's always
  // current even when called from a stale closure -- e.g. `handleRestart`
  // awaiting `handleStop()` then calling `handleRun()` still holds whichever
  // `handleRun` reference was bound to the render the click happened on, and
  // that closure's own `isRunning` would otherwise be frozen at "true" (its
  // guard would then bail out and Restart would silently no-op).
  const isRunningRef = useRef(false);
  const setRunning = useCallback((value: boolean) => {
    isRunningRef.current = value;
    setIsRunning(value);
  }, []);
  const jobIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const abortRunAllRef = useRef(false);
  const isSmallScreen = useIsSmallScreen();

  // The integrated terminal is seeded from whatever the explorer currently
  // has open -- keying TerminalPanel by rootId (below) forces a fresh
  // container/session (and re-seed) whenever the user opens a different
  // project, rather than leaving a stale copy of the old one running.
  const explorerNodes = useExplorerStore((s) => s.nodes);
  const explorerRootId = useExplorerStore((s) => s.rootId);
  const terminalFiles = useMemo(
    () => flattenTreeForTerminal(explorerNodes, explorerRootId),
    [explorerNodes, explorerRootId]
  );

  // Feature 1 (Problems panel): mirrors Monaco's marker table (LSP +
  // Verilator lint + the compiler-output parser below) into a flat list --
  // see useProblems.ts for why there's no separate diagnostics store.
  const monaco = useMonaco();
  const problems = useProblems({ monaco, nodes: explorerNodes });
  const compilerMarkers = useCompilerMarkers({ monaco, nodes: explorerNodes, rootId: explorerRootId });

  const handleSelectProblem = useCallback((entry: ProblemEntry) => {
    const explorer = useExplorerStore.getState();
    const node = explorer.nodes[entry.fileId];
    if (!node || node.kind !== "file") return;
    // Same open/activate-tab flow FileTree.tsx's row click and
    // lspNavigation.ts's cross-file jumps both use.
    explorer.openFile(entry.fileId);
    useEditorStore.getState().openFile(entry.fileId);
    const opened = editorManager.revealLocation(
      entry.fileId,
      { lineNumber: entry.line, column: entry.column },
      { readOnly: !!(node.readOnly || node.locked) }
    );
    if (opened) editorManager.flashLine(entry.fileId, entry.line);
  }, []);

  /** Runs exactly one testbench end to end -- analyze -> send payload ->
   * stream compile/run -> record the result as its own Simulation Manager
   * session. Shared by both "Run" (single, `undefined` = whatever
   * TestbenchSelector has chosen) and "Run All" (explicit id per testbench),
   * so a single execution path backs both modes. */
  const runOneTestbench = useCallback(
    async (
      testbenchOverrideId: string | null | undefined,
      options?: { mode?: "simulate" | "lint" }
    ): Promise<{ status: string }> => {
      const mode = options?.mode ?? "simulate";
      // The Workspace Analyzer is the only source of truth for the run payload --
      // no separate file scan happens here. This reuses the existing analyzer
      // pipeline (never a second one) to produce a payload reflecting the
      // workspace's current state, then sends that payload as-is.
      await useAnalysisStore
        .getState()
        .runAnalysis(editorActiveTabId ?? DEFAULT_RUN_TAB_ID, language, testbenchOverrideId, mode);
      const payload = useAnalysisStore.getState().payload;
      if (!payload) {
        throw new Error("Workspace analysis did not produce an execution payload");
      }

      const compiledTestbenchId = payload.execution.compileFiles.find(
        (id) => payload.files[id]?.category === "testbench"
      );
      const testbenchFile = compiledTestbenchId ? payload.files[compiledTestbenchId] : null;
      const sessionId = testbenchFile?.path ?? `run-${Date.now()}`;
      const displayName =
        payload.execution.testbench ??
        testbenchFile?.path.split("/").pop() ??
        (mode === "lint" ? payload.project.name : "testbench");

      // Feature 1/2: reset this run's compiler markers/badges before
      // streaming starts, so a clean recompile doesn't keep showing a
      // previous run's stale errors on unrelated files.
      compilerMarkers.clear();
      const erroredFileIds = new Set<string>();

      useSimulationStore.getState().upsertSession({
        id: sessionId,
        jobId: null,
        testbenchName: displayName,
        status: "running",
        executionTimeMs: null,
        waveformUrl: null,
        hasWaveform: false,
        timestamp: Date.now(),
      });
      useSimulationStore.getState().setActiveSession(sessionId);
      setExecutionLogs((prev) => [
        ...prev,
        makeLog(mode === "lint" ? `Checking ${displayName} (syntax only)...` : `Running ${displayName}...`),
      ]);

      const runRes = await fetch(`${API_URL}/api/v1/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        const message = body.detail ?? `Run request failed (${runRes.status})`;
        useSimulationStore.getState().patchSession(sessionId, { status: "failed" });
        throw new Error(message);
      }

      const { jobId } = (await runRes.json()) as { jobId: string };
      jobIdRef.current = jobId;
      useSimulationStore.getState().patchSession(sessionId, { jobId });

      return await new Promise<{ status: string }>((resolve, reject) => {
        let settled = false;
        const ws = new WebSocket(`${getWsUrl()}/ws/execute/${jobId}`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data) as RunWsMessage;

          if (msg.type === "log" && msg.message) {
            setExecutionLogs((prev) => [...prev, makeLog(msg.message as string)]);
          } else if (msg.type === "output" && msg.text) {
            // stdout is the running program's own $display/$monitor/$write --
            // "Simulation Output". Everything else (compile/build-tool noise,
            // run-phase stderr) is the advanced "Build Log" firehose. Never
            // reached for a lint job at all -- the backend stops before
            // adapter.run() ever produces a stdout/stderr message (see
            // ExecutionManager.stream_execution's mode=="lint" branch).
            const channel: ChannelLogEntry["channel"] = msg.stream === "stdout" ? "simulation" : "build";
            setOutputEntries((prev) => [
              ...prev,
              { ...makeLog(msg.text as string, msg.stream === "stderr" ? "error" : "info"), channel },
            ]);
            // Feature 1: paint compile-stage output as Monaco markers (same
            // "compiler" owner as useCompilerMarkers.ts) so the Problems
            // panel picks it up automatically -- Verilator's own /lint
            // pipeline never sees these, since it's a separate on-save call.
            if (msg.stream === "compiler") {
              const { erroredFileIds: fileIds } = compilerMarkers.apply(msg.text, msg.diagnostics);
              fileIds.forEach((id) => erroredFileIds.add(id));
            }
          } else if (msg.type === "result") {
            settled = true;
            const hasWaveform = Boolean(msg.hasWaveform);
            const resultWaveformUrl = hasWaveform ? `${API_URL}/api/v1/waveform/${jobId}/raw` : null;
            useSimulationStore.getState().patchSession(sessionId, {
              status: msg.status ?? "failed",
              executionTimeMs: msg.executionTimeMs ?? null,
              waveformUrl: resultWaveformUrl,
              hasWaveform,
            });
            // The final result's merged diagnostics are the authoritative
            // set -- apply them here too (not just from live stream:"compiler"
            // chunks above), so Problems is reliably populated even if a
            // chunk was missed/raced, and so runtime diagnostics (which never
            // arrive as a live "compiler" message) reach Monaco at all.
            if (msg.diagnostics && msg.diagnostics.length > 0) {
              const { erroredFileIds: fileIds } = compilerMarkers.apply("", msg.diagnostics);
              fileIds.forEach((id) => erroredFileIds.add(id));
            }
            // Feature 2: Explorer file badges -- reflects this run's outcome
            // per compiled file, independent of whether its tab is open.
            useCompileStatusStore
              .getState()
              .recordCompileResult(payload.execution.compileFiles, Array.from(erroredFileIds), msg.status === "completed");
            const timing = msg.executionTimeMs !== undefined ? ` (${msg.executionTimeMs}ms)` : "";
            const resultMode = msg.mode ?? mode;
            const completionLabel =
              msg.status === "completed" ? (resultMode === "lint" ? "Syntax Check Passed" : "Completed") : msg.status;
            setExecutionLogs((prev) => [
              ...prev,
              makeLog(`--- ${displayName} ${completionLabel}${timing} ---`, msg.status === "completed" ? "success" : "error"),
            ]);
            setLastResult({
              mode: resultMode,
              status: (msg.status ?? "failed") as "completed" | "failed" | "terminated",
              warningCount: msg.warningCount ?? 0,
              errorCount: msg.errorCount ?? 0,
              buildTimeMs: msg.buildTimeMs ?? null,
              runTimeMs: msg.runTimeMs ?? null,
            });
            resolve({ status: msg.status ?? "failed" });
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!settled) {
            settled = true;
            useSimulationStore.getState().patchSession(sessionId, { status: "terminated" });
            resolve({ status: "terminated" });
          }
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            useSimulationStore.getState().patchSession(sessionId, { status: "failed" });
            setExecutionLogs((prev) => [...prev, makeLog("WebSocket connection error", "error")]);
            reject(new Error("WebSocket connection error"));
          }
        };
      });
    },
    [language, editorActiveTabId, compilerMarkers]
  );

  const handleRun = useCallback(async () => {
    if (isRunningRef.current) return;

    const { nodes, rootId } = useExplorerStore.getState();
    if (listTestbenchFiles(nodes, rootId).length === 0) {
      setNoTestbenchPrompt({ mode: "run", topModule: findTopModuleForTestbenchGeneration(nodes, rootId) });
      return;
    }

    setRunning(true);
    setExecutionLogs([makeLog("Analyzing workspace...")]);
    setOutputEntries([]);
    setLastResult(null);

    try {
      await runOneTestbench(undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start run";
      setExecutionLogs((prev) => [...prev, makeLog(message, "error")]);
      setOutputEntries((prev) => [...prev, { ...makeLog(message, "error"), channel: "build" }]);
    } finally {
      setRunning(false);
    }
  }, [runOneTestbench, setRunning]);

  const handleRunAll = useCallback(async () => {
    if (isRunningRef.current) return;

    const { nodes, rootId } = useExplorerStore.getState();
    const testbenches = listTestbenchFiles(nodes, rootId);
    if (testbenches.length === 0) {
      setNoTestbenchPrompt({ mode: "runAll", topModule: findTopModuleForTestbenchGeneration(nodes, rootId) });
      return;
    }

    setRunning(true);
    abortRunAllRef.current = false;
    setExecutionLogs([makeLog(`Running ${testbenches.length} testbench(es) sequentially...`)]);
    setOutputEntries([]);
    setLastResult(null);

    const summary: { name: string; status: string }[] = [];
    for (const tb of testbenches) {
      if (abortRunAllRef.current) {
        summary.push({ name: tb.relativePath, status: "terminated" });
        continue;
      }
      try {
        const outcome = await runOneTestbench(tb.id);
        summary.push({ name: tb.relativePath, status: outcome.status });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        summary.push({ name: tb.relativePath, status: "failed" });
        setExecutionLogs((prev) => [...prev, makeLog(`${tb.relativePath}: ${message}`, "error")]);
      }
    }

    setExecutionLogs((prev) => [
      ...prev,
      makeLog("--- Run All Summary ---"),
      ...summary.map((s) =>
        makeLog(
          `${s.status === "completed" ? "✔" : "✖"} ${s.name} (${s.status})`,
          s.status === "completed" ? "success" : "error"
        )
      ),
    ]);
    setRunning(false);
  }, [runOneTestbench, setRunning]);

  /** Extension a generated/manually-created testbench file should use --
   * matches the top module's own source language so it compiles alongside it. */
  const testbenchExtensionFor = (lang: TopModuleForTestbench["language"]) =>
    lang === "verilog" ? "v" : lang === "systemverilog" ? "sv" : "vhd";

  /** "Continue Without Testbench" -- runs a real Verilator lint-only pass
   * (execution.mode="lint", see ExecutionManager) instead of skipping the
   * run or throwing against an empty payload. Never generates anything. */
  const handleContinueWithoutTestbench = useCallback(async () => {
    setNoTestbenchPrompt(null);
    if (isRunningRef.current) return;

    setRunning(true);
    setExecutionLogs([makeLog("Analyzing workspace (syntax check only)...")]);
    setOutputEntries([]);
    setLastResult(null);

    try {
      await runOneTestbench(null, { mode: "lint" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start syntax check";
      setExecutionLogs((prev) => [...prev, makeLog(message, "error")]);
      setOutputEntries((prev) => [...prev, { ...makeLog(message, "error"), channel: "build" }]);
    } finally {
      setRunning(false);
    }
  }, [runOneTestbench, setRunning]);

  const handleCreateManualTestbench = useCallback(() => {
    const top = noTestbenchPrompt?.topModule;
    setNoTestbenchPrompt(null);
    const { rootId } = useExplorerStore.getState();
    const parentId = top?.parentFolderId ?? rootId;
    const name = top ? `${top.module.name}_tb.${testbenchExtensionFor(top.language)}` : "testbench.v";
    useExplorerStore.getState().createAndOpenFile(parentId, name, "");
  }, [noTestbenchPrompt]);

  const handleStop = useCallback(async () => {
    abortRunAllRef.current = true;
    const jobId = jobIdRef.current;
    wsRef.current?.close();
    wsRef.current = null;
    setRunning(false);

    if (!jobId) return;
    try {
      await fetch(`${API_URL}/api/v1/execute/${jobId}/stop`, { method: "POST" });
      setExecutionLogs((prev) => [...prev, makeLog("Stop requested")]);
    } catch {
      // Best-effort: the socket is already closed client-side regardless.
    }
  }, [setRunning]);

  /** Debug Toolbar's Restart -- stop whatever's running, then start a fresh
   * Run. `handleRun`'s guard reads `isRunningRef` (not the `isRunning` state
   * closure), so it correctly proceeds here even though this awaits
   * `handleStop()` first -- see `isRunningRef`'s doc above for why that
   * distinction matters for this specific composed action. */
  const handleRestart = useCallback(async () => {
    await handleStop();
    await handleRun();
  }, [handleStop, handleRun]);

  const handleTerminalWaveform = useCallback((url: string) => {
    useSimulationStore.getState().upsertSession({
      id: "terminal-session",
      jobId: null,
      testbenchName: "Terminal Session",
      status: "completed",
      executionTimeMs: null,
      waveformUrl: url,
      hasWaveform: true,
      timestamp: Date.now(),
    });
    useSimulationStore.getState().setActiveSession("terminal-session");
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Simulation Output and Build Log (Advanced) each clear only their own
  // channel -- clearing one shouldn't silently wipe the other's history.
  const handleClearOutput = useCallback(() => {
    setOutputEntries((prev) => prev.filter((e) => e.channel !== "simulation"));
  }, []);

  const handleClearBuildLog = useCallback(() => {
    setOutputEntries((prev) => prev.filter((e) => e.channel !== "build"));
  }, []);

  const handleClearLog = useCallback(() => {
    setExecutionLogs([]);
  }, []);

  const simulationOutputEntries = useMemo(() => outputEntries.filter((e) => e.channel === "simulation"), [outputEntries]);
  const buildLogEntries = useMemo(() => outputEntries.filter((e) => e.channel === "build"), [outputEntries]);

  const bottomPanelMaximized = useRightPanelStore((s) => s.bottomPanelMaximized);

  const editorColumn = (
    <div className="flex h-full flex-col overflow-hidden bg-editor-bg">
      <EditorTabBar isExpanded={isExpanded} onToggleExpand={() => setIsExpanded((v) => !v)} />
      <ResizableLayout
        direction="column"
        defaultPercent={70}
        minFirstPx={200}
        minSecondPx={120}
        forcedPercent={bottomPanelMaximized ? 0 : undefined}
        first={
          <MultiFileEditor
            projectId={PROJECT_ID}
            onRun={handleRun}
            onStop={handleStop}
            onRestart={handleRestart}
            isRunning={isRunning}
          />
        }
        second={
          <BottomPanel
            key={explorerRootId}
            projectId={PROJECT_ID}
            files={terminalFiles}
            onWaveformAvailable={handleTerminalWaveform}
            problems={problems}
            onSelectProblem={handleSelectProblem}
            executionLogs={executionLogs}
            onClearLog={handleClearLog}
            buildLogEntries={buildLogEntries}
            onClearBuildLog={handleClearBuildLog}
            onRun={handleRun}
            onStop={handleStop}
          />
        }
      />
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app-bg">
      <Header
        language={language}
        onLanguageChange={setLanguage}
        onRun={handleRun}
        onRunAll={handleRunAll}
        onStop={handleStop}
        isRunning={isRunning}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        {/* Keeps editorColumn (and therefore MultiFileEditor/CodeEditor) at
         * the exact same wrapper depth in both states -- only
         * CollapsibleRightPanel's presence toggles, as a trailing sibling.
         * Wrapping editorColumn in an extra layer only when NOT expanded (as
         * this used to) changes its position's shape across the toggle, and
         * React remounts a subtree whose shape changed -- unmounting Monaco
         * itself, exactly what EditorManager's permanently-mounted-editor
         * design (see its module doc) depends on never happening. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            style={isExpanded ? undefined : { minWidth: 340 }}
          >
            {editorColumn}
          </div>
          {!isExpanded && (
            <CollapsibleRightPanel
              output={
                <div className="flex h-full min-h-0 flex-col gap-2">
                  {lastResult && <ExecutionSummary {...lastResult} />}
                  <div className="min-h-0 flex-1">
                    <Terminal logs={simulationOutputEntries} onClear={handleClearOutput} />
                  </div>
                </div>
              }
              waveform={<WaveformPanel />}
              forceCollapsed={isSmallScreen}
            />
          )}
        </div>
      </div>

      <StatusBar />
      <Toast />
      <CommandPalette
        open={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onRun={handleRun}
        onStop={handleStop}
        isRunning={isRunning}
        onOpenShortcutHelp={() => setIsShortcutHelpOpen(true)}
      />
      <KeyboardShortcutsModal open={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />
      {noTestbenchPrompt && (
        <NoTestbenchDialog
          onContinueWithoutTestbench={handleContinueWithoutTestbench}
          onCreateManually={handleCreateManualTestbench}
          onCancel={() => setNoTestbenchPrompt(null)}
        />
      )}
    </div>
  );
}

/** Gate the whole IDE on store hydration so the persisted workspace is
 * restored from localStorage BEFORE first paint -- rendering IdeWorkspace
 * early would flash the seed (`vetfab_project`) tree and then swap, which is
 * exactly the "dummy workspace briefly loads / wins" bug. localStorage is
 * synchronous, so this gate resolves on the next tick (no real spinner). */
export default function Home() {
  const hydrated = useStoresHydrated();

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-app-bg">
        <p className="text-sm text-text-muted">Restoring your workspace…</p>
      </div>
    );
  }

  return <IdeWorkspace />;
}
