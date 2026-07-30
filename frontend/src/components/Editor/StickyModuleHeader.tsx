"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useEditorRuntimeStore } from "@/store/editorRuntimeStore";
import { findEnclosingNode, type OutlineKind } from "@/services/analysis/hdlOutline";
import { editorManager } from "@/services/editor/EditorManager";
import { IconChevronRight } from "@/components/icons";

const KIND_LABEL: Partial<Record<OutlineKind, string>> = {
  module: "module",
  entity: "entity",
  architecture: "architecture",
  function: "function",
  task: "task",
  process: "process",
};

/** Pins the enclosing module/entity (plus one nested function/task/process
 * level, if any is open at the current scroll position) to the top of the
 * editor once you've scrolled past its own declaration line -- Monaco has no
 * first-class API for this, so it's built on the same outline
 * (`hdlOutline.ts`) the cursor inspector uses, keyed off scroll position
 * (`topVisibleLine`) instead of cursor position.
 *
 * Always renders a fixed-height slot as a normal flex sibling above the
 * editor (see MultiFileEditor.tsx) rather than an overlay or a
 * conditionally-mounted element -- either of those would resize Monaco's
 * viewport as you scroll past a boundary, which is exactly what caused
 * flicker in earlier passes at this. Only the breadcrumb *content* toggles;
 * the reserved space never does. */
export default function StickyModuleHeader() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const outlinePath = useEditorRuntimeStore((s) => s.outlinePath);
  const outline = useEditorRuntimeStore((s) => s.outline);
  const topVisibleLine = useEditorRuntimeStore((s) => s.topVisibleLine);

  const chain = useMemo(() => {
    if (!activeTabId || outlinePath !== activeTabId) return [];
    const top = findEnclosingNode(outline, topVisibleLine, ["module", "entity", "architecture"]);
    if (!top || top.startLine >= topVisibleLine) return [];
    const nested = findEnclosingNode(outline, topVisibleLine, ["function", "task", "process"]);
    return nested && nested.startLine < topVisibleLine && nested.startLine >= top.startLine ? [top, nested] : [top];
  }, [activeTabId, outlinePath, outline, topVisibleLine]);

  const jumpTo = (line: number) => {
    if (!activeTabId) return;
    editorManager.revealLocation(activeTabId, { lineNumber: line, column: 1 });
  };

  return (
    <div
      className={`z-10 flex h-7 shrink-0 items-center overflow-hidden bg-editor-bg px-3 text-xs transition-colors duration-150 ${
        chain.length > 0 ? "border-b border-panel-border shadow-panel" : ""
      }`}
    >
      {chain.length > 0 && (
        <div className="flex min-w-0 items-center gap-1 text-text-secondary">
          {chain.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <IconChevronRight className="h-3 w-3 shrink-0 text-text-muted" />}
              <button
                type="button"
                onClick={() => jumpTo(node.startLine)}
                title={`Go to ${KIND_LABEL[node.kind] ?? node.kind} ${node.name} (line ${node.startLine})`}
                className="truncate rounded px-1 font-mono transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary"
              >
                <span className="text-accent">{KIND_LABEL[node.kind] ?? node.kind}</span> {node.name}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
