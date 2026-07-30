"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorRuntimeStore } from "@/store/editorRuntimeStore";
import { findEnclosingNode } from "@/services/analysis/hdlOutline";
import { getMonacoLanguage } from "@/services/editor/languageMapping";
import { extname } from "@/utils/format";

const LANGUAGE_LABEL: Record<string, string> = {
  verilog: "Verilog/SystemVerilog",
  vhdl: "VHDL",
};

/** Cursor Inspector: a thin, VS Code-style status bar spanning the whole IDE
 * window (not just the editor pane) -- mirrors where Vivado/Quartus/VS Code
 * all put this. Reads cursor position + the active file's outline straight
 * from `editorRuntimeStore` (populated by MultiFileEditor's Monaco listeners
 * and the shared `hdlOutline` parser) rather than re-deriving either; no
 * separate parse happens here. */
export default function StatusBar() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const nodes = useExplorerStore((s) => s.nodes);
  const cursorLine = useEditorRuntimeStore((s) => s.cursorLine);
  const cursorColumn = useEditorRuntimeStore((s) => s.cursorColumn);
  const outlinePath = useEditorRuntimeStore((s) => s.outlinePath);
  const outline = useEditorRuntimeStore((s) => s.outline);

  const activeNode = activeTabId ? nodes[activeTabId] : null;
  const isActiveFile = !!activeNode && activeNode.kind === "file";
  const language = activeNode && activeNode.kind === "file" ? getMonacoLanguage(extname(activeNode.name)) : null;

  const { moduleNode, routineNode, alwaysNode } = useMemo(() => {
    if (!activeTabId || outlinePath !== activeTabId) {
      return { moduleNode: undefined, routineNode: undefined, alwaysNode: undefined };
    }
    return {
      moduleNode: findEnclosingNode(outline, cursorLine, ["module", "entity", "architecture"]),
      routineNode: findEnclosingNode(outline, cursorLine, ["function", "task", "process"]),
      alwaysNode: findEnclosingNode(outline, cursorLine, ["always"]),
    };
  }, [activeTabId, outlinePath, outline, cursorLine]);

  return (
    <div className="flex h-6 shrink-0 select-none items-center justify-between border-t border-panel-border bg-status-bar-bg px-3 text-[11px] text-text-secondary">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        {language && <span className="shrink-0 font-medium text-text-muted">{LANGUAGE_LABEL[language] ?? language}</span>}
        {moduleNode && (
          <span className="truncate">
            Module: <span className="text-text-primary">{moduleNode.name}</span>
          </span>
        )}
        {routineNode && (
          <span className="truncate">
            {routineNode.kind === "process" ? "Process" : routineNode.kind === "task" ? "Task" : "Function"}:{" "}
            <span className="text-text-primary">{routineNode.name}</span>
          </span>
        )}
        {alwaysNode && (
          <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[10px] text-accent">
            {alwaysNode.detail ?? alwaysNode.name}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {isActiveFile && (
          <span>
            Ln {cursorLine}, Col {cursorColumn}
          </span>
        )}
        {/* Future-ready: overwrite/insert-mode toggle isn't wired to Monaco
         * yet (it has no standalone overtype mode), so this just reserves
         * the slot VS Code's status bar uses for it. */}
        <span className="text-text-muted" title="Insert mode">
          INS
        </span>
      </div>
    </div>
  );
}
