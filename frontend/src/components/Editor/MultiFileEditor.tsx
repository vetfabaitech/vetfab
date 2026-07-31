"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMonaco, type OnMount } from "@monaco-editor/react";
import { useEditorStore } from "@/store/editorStore";
import { useExplorerStore } from "@/store/explorerStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useToastStore } from "@/store/toastStore";
import { useEditorRuntimeStore } from "@/store/editorRuntimeStore";
import { extname } from "@/utils/format";
import { getMonacoLanguage } from "@/services/editor/languageMapping";
import { buildHdlOutline } from "@/services/analysis/hdlOutline";
import { useLspClient } from "@/hooks/useLspClient";
import { useVerilatorLint } from "@/hooks/useVerilatorLint";
import { useSaveAllFiles } from "@/hooks/useSaveAllFiles";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { editorManager } from "@/services/editor/EditorManager";
import { formatFileOnSave } from "@/services/editor/formatFile";
import { relativePathFor } from "@/services/lsp/workspacePaths";
import CodeEditor from "./CodeEditor";
import EmptyEditorState from "./EmptyEditorState";
import WelcomeScreen from "./WelcomeScreen";
import StickyModuleHeader from "./StickyModuleHeader";
import QuickActionToolbar from "./QuickActionToolbar";
import type { FolderNodeData } from "@/types/explorer";
import { getApiUrl, getWsUrl } from "@/lib/env";

/** verible-verilog-format only understands Verilog/SystemVerilog -- "Format
 * on Save" silently skips anything else (VHDL, .tcl, .md, ...) rather than
 * firing a network call that's guaranteed to fail. */
const VERIBLE_FORMATTABLE = /\.(v|sv|svh|vh)$/i;

const API_URL = getApiUrl();

interface MultiFileEditorProps {
  projectId: string;
  /** Threaded down from the IDE shell (page.tsx) so the Quick Action
   * Toolbar's Run/Stop buttons and the Ctrl+R shortcut drive the exact same
   * run pipeline as the Header's own Run button, rather than a second one. */
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
  isRunning: boolean;
}

/** The center editor pane: one permanently-mounted Monaco editor instance,
 * with the empty state overlaid on top of it rather than swapped in by
 * unmounting the editor -- unmounting was the root cause of the
 * "single-file editor" behavior this component used to have (see
 * `EditorManager.ts`'s module doc for the full story: `@monaco-editor/react`
 * disposes the active model on unmount unless told otherwise, silently
 * dropping undo history/cursor position). All model creation/switching/
 * disposal is delegated to `EditorManager`; this component's job is just to
 * keep it in sync with `useEditorStore`'s tab list, the same way
 * `EditorGroupView` keeps VS Code's model service in sync with its own tab
 * strip. */
export default function MultiFileEditor({ projectId, onRun, onStop, onRestart, isRunning }: MultiFileEditorProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const updateFileContent = useExplorerStore((s) => s.updateFileContent);
  const clearFileDirty = useExplorerStore((s) => s.clearFileDirty);
  const saveAllFiles = useExplorerStore((s) => s.saveAllFiles);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const formatOnSave = useSettingsStore((s) => s.formatOnSave);
  const showToast = useToastStore((s) => s.show);

  const { saveAll, hasUnsavedChanges } = useSaveAllFiles();

  const monaco = useMonaco();
  const previousOpenIdsRef = useRef<Set<string>>(new Set());

  // Flips once `EditorManager.attach` has actually run. `onMount` fires
  // imperatively from inside @monaco-editor/react's own effect, which can
  // land in a different commit than `useMonaco()` resolving -- without this,
  // the tab-sync effects below could run once against a still-null editor
  // instance (a no-op) and never get another chance to activate anything.
  const [editorReady, setEditorReady] = useState(false);

  // Verilog/SystemVerilog language intelligence: svlangserver (completion/
  // hover/definition/etc, via WS /ws/lsp) and Verilator (on-save/debounced
  // lint markers, via POST /api/v1/lint) -- see backend/README.md.
  useLspClient({ monaco, projectId, apiUrl: API_URL, wsUrl: getWsUrl(), tabs, activeTabId, nodes, rootId });
  const { lintNow } = useVerilatorLint({ monaco, apiUrl: API_URL, projectId, nodes, rootId, tabs });

  const handleEditorMount: OnMount = useCallback((editorInstance, monacoInstance) => {
    editorManager.attach(editorInstance, monacoInstance);
    setEditorReady(true);
  }, []);

  // Content now flows model -> store (EditorManager owns the text buffer),
  // the reverse of the old `value`/`onChange` props -- wire it once so every
  // model's edits keep the dirty dot, workspace-seeding, and the debounced
  // LSP/Verilator sync effects (which still read node.content) up to date.
  useEffect(() => {
    editorManager.configureChangeListener((fileId, content) => updateFileContent(fileId, content));
  }, [updateFileContent]);

  // Ensure every open tab has a model (creating it from the tree's stored
  // content on first open), and dispose models for tabs that fully closed --
  // same open/closed-id diffing this effect always did, now delegated to
  // EditorManager instead of calling monaco.editor.getModel/dispose directly.
  useEffect(() => {
    if (!monaco || !editorReady) return;
    const currentIds = new Set(tabs.map((t) => t.fileId));
    for (const tab of tabs) {
      if (editorManager.getModel(tab.fileId)) continue;
      const node = nodes[tab.fileId];
      if (!node || node.kind !== "file") continue;
      editorManager.createModel(tab.fileId, node.content ?? "", getMonacoLanguage(extname(node.name)));
    }
    for (const previousId of previousOpenIdsRef.current) {
      if (!currentIds.has(previousId)) editorManager.closeFile(previousId);
    }
    previousOpenIdsRef.current = currentIds;
  }, [tabs, nodes, monaco, editorReady]);

  // Switch the editor onto whichever tab is active (a no-op besides
  // re-applying `readOnly` if it's already showing -- see
  // EditorManager.activateModel).
  useEffect(() => {
    if (!monaco || !editorReady || !activeTabId) return;
    const node = nodes[activeTabId];
    if (!node || node.kind !== "file") return;
    editorManager.switchTab(activeTabId, { readOnly: !!(node.readOnly || node.locked) });
  }, [monaco, editorReady, activeTabId, nodes]);

  // Breakpoint gutter (Feature 6) -- called right after the tab-switch
  // effect above so its decoration sync always sees the already-swapped
  // model, not the outgoing tab's.
  useBreakpoints(monaco, editorReady, activeTabId);

  // Cursor Inspector (status bar) + sticky module header telemetry: one
  // cursor-position listener and one scroll listener on the single live
  // editor instance, feeding the session-only editorRuntimeStore -- see that
  // store's doc for why this lives outside useEditorStore/useExplorerStore.
  useEffect(() => {
    if (!editorReady) return;
    const editor = editorManager.getEditorInstance();
    if (!editor) return;
    const runtime = useEditorRuntimeStore.getState();
    const initial = editor.getPosition();
    if (initial) runtime.setCursor(initial.lineNumber, initial.column);

    const cursorSub = editor.onDidChangeCursorPosition((e) => {
      useEditorRuntimeStore.getState().setCursor(e.position.lineNumber, e.position.column);
    });

    let scrollFrame: number | null = null;
    const scrollSub = editor.onDidScrollChange(() => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        const visible = editor.getVisibleRanges()[0];
        if (visible) useEditorRuntimeStore.getState().setTopVisibleLine(visible.startLineNumber);
      });
    });

    return () => {
      cursorSub.dispose();
      scrollSub.dispose();
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    };
  }, [editorReady]);

  // Outline (module/entity/function/task/always-block ranges) for whichever
  // file is active -- recomputed on tab switch and on debounced content
  // change, NOT on every keystroke/render, so large files stay cheap (see
  // hdlOutline.ts's doc). Depends only on activeTabId/editorReady/monaco --
  // deliberately not `nodes` (a fresh object identity every keystroke, see
  // explorerStore.updateFileContent) or this would reparse on every char typed
  // in the active file.
  useEffect(() => {
    const runtime = useEditorRuntimeStore.getState();
    if (!monaco || !editorReady || !activeTabId) {
      runtime.resetOutline();
      return;
    }
    const model = editorManager.getModel(activeTabId);
    const node = nodes[activeTabId];
    if (!model || !node || node.kind !== "file") {
      runtime.resetOutline();
      return;
    }
    const language = getMonacoLanguage(extname(node.name));

    const recompute = () => {
      useEditorRuntimeStore.getState().setOutline(activeTabId, buildHdlOutline(model.getValue(), language));
    };
    recompute();

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = model.onDidChangeContent(() => {
      clearTimeout(debounce);
      debounce = setTimeout(recompute, 300);
    });
    return () => {
      sub.dispose();
      clearTimeout(debounce);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, editorReady, activeTabId]);

  /** Backs both the "Format on Save" auto-format (Ctrl+S, below) and the
   * Quick Action Toolbar's explicit "Format Code" button -- one code path,
   * so a manual format always behaves identically to the on-save one. */
  const formatFile = useCallback(
    (fileId: string) => {
      const node = nodes[fileId];
      const relativePath = relativePathFor(fileId, nodes);
      if (!node || node.kind !== "file" || !relativePath || !VERIBLE_FORMATTABLE.test(relativePath)) return;
      return formatFileOnSave(API_URL, projectId, relativePath, node.content ?? "")
        .then((formatted) => editorManager.applyFormattedText(fileId, formatted))
        .catch((err) => showToast(err instanceof Error ? err.message : "Formatting failed", "error"));
    },
    [nodes, projectId, showToast]
  );

  const canFormatActive = !!(
    activeTabId &&
    nodes[activeTabId]?.kind === "file" &&
    relativePathFor(activeTabId, nodes) &&
    VERIBLE_FORMATTABLE.test(relativePathFor(activeTabId, nodes) ?? "")
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        if (formatOnSave && activeTabId) formatFile(activeTabId);
        if (activeTabId) clearFileDirty(activeTabId);
        lintNow();
      } else if (key === "b") {
        // Quick Action Toolbar / keyboard-shortcut-help "Compile" -- a
        // Verilator lint pass, the same on-demand check Ctrl+S already
        // triggers, just without requiring a save first.
        e.preventDefault();
        lintNow();
      } else if (key === "r" && !e.shiftKey) {
        e.preventDefault();
        onRun();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, clearFileDirty, lintNow, formatOnSave, formatFile, onRun]);

  // Preferences panel's "Auto Save": once idle for a second after the last
  // edit, save every dirty file the same way the toolbar's Save button does.
  // Re-arms on every `nodes` change (a fresh object identity on each
  // keystroke, see updateFileContent) -- same debounce shape as
  // useVerilatorLint's on-edit lint timer.
  useEffect(() => {
    if (!autoSave) return;
    const hasDirty = Object.values(nodes).some((n) => n.kind === "file" && n.dirty);
    if (!hasDirty) return;
    const timer = setTimeout(() => saveAllFiles(), 1000);
    return () => clearTimeout(timer);
  }, [autoSave, nodes, saveAllFiles]);

  const activeNode = activeTabId ? nodes[activeTabId] : null;
  const showEmptyState = !activeTabId || !activeNode || activeNode.kind !== "file";
  const isWorkspaceEmpty = (nodes[rootId] as FolderNodeData | undefined)?.children.length === 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <QuickActionToolbar
        canFormat={canFormatActive}
        hasUnsavedChanges={hasUnsavedChanges}
        isRunning={isRunning}
        onRun={onRun}
        onStop={onStop}
        onRestart={onRestart}
        onCompile={lintNow}
        onFormat={() => activeTabId && formatFile(activeTabId)}
        onSaveAll={saveAll}
      />
      <div className="relative min-h-0 flex-1">
        {/* Always mounted -- see the module doc for why this must never
         * unmount. Hidden (not unmounted) behind the empty state. Laid out as
         * a column (sticky header, fixed height, above the editor) rather
         * than an overlay, so the sticky header reserves real space instead
         * of covering the first code line -- and never changes Monaco's
         * viewport size while scrolling, which is what would cause flicker. */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{ visibility: showEmptyState ? "hidden" : "visible" }}
        >
          <StickyModuleHeader />
          <div className="min-h-0 flex-1">
            <CodeEditor onMount={handleEditorMount} />
          </div>
        </div>
        {showEmptyState && (
          <div className="absolute inset-0">
            {isWorkspaceEmpty ? <WelcomeScreen /> : <EmptyEditorState />}
          </div>
        )}
      </div>
    </div>
  );
}
