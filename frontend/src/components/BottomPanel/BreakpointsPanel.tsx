"use client";

import { useMemo } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import { useBreakpointStore, type Breakpoint } from "@/store/breakpointStore";
import { editorManager } from "@/services/editor/EditorManager";
import { relativePathFor } from "@/services/lsp/workspacePaths";
import { IconBreakpointDot, IconTrash } from "@/components/icons";

/** Lists every breakpoint across the whole workspace (not just the active
 * file) -- toggle click gutters in the editor; this panel is for
 * cross-file navigation/management, mirroring the Problems panel's
 * "grouped list you can jump from" shape. Reads `breakpointStore` directly
 * (same store `useBreakpoints.ts` writes to from gutter clicks) rather than
 * keeping its own copy. */
export default function BreakpointsPanel() {
  const breakpoints = useBreakpointStore((s) => s.breakpoints);
  const toggleEnabled = useBreakpointStore((s) => s.setEnabled);
  const remove = useBreakpointStore((s) => s.remove);
  const nodes = useExplorerStore((s) => s.nodes);
  const openExplorerFile = useExplorerStore((s) => s.openFile);
  const openEditorTab = useEditorStore((s) => s.openFile);

  const rows = useMemo(() => {
    return Object.values(breakpoints)
      .map((bp) => ({ bp, node: nodes[bp.fileId] }))
      .filter((r): r is { bp: Breakpoint; node: NonNullable<typeof r.node> } => !!r.node)
      .sort((a, b) => {
        const pathA = relativePathFor(a.bp.fileId, nodes) ?? a.node.name;
        const pathB = relativePathFor(b.bp.fileId, nodes) ?? b.node.name;
        return pathA.localeCompare(pathB) || a.bp.line - b.bp.line;
      });
  }, [breakpoints, nodes]);

  const navigate = (bp: Breakpoint) => {
    if (nodes[bp.fileId]?.kind !== "file") return;
    openExplorerFile(bp.fileId);
    openEditorTab(bp.fileId);
    const opened = editorManager.revealLocation(bp.fileId, { lineNumber: bp.line, column: 1 });
    if (opened) editorManager.flashLine(bp.fileId, bp.line);
  };

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-terminal-bg px-6 text-center text-sm text-text-muted">
        No breakpoints yet. Click a line&apos;s gutter in the editor to set one.
      </div>
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-terminal-bg py-1">
      {rows.map(({ bp, node }) => {
        const relativePath = relativePathFor(bp.fileId, nodes) ?? node.name;
        return (
          <div
            key={bp.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(bp)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(bp);
              }
            }}
            className="group flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[12.5px] outline-none transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleEnabled(bp.fileId, bp.line, !bp.enabled);
              }}
              aria-label={bp.enabled ? "Disable breakpoint" : "Enable breakpoint"}
              title={bp.enabled ? "Disable breakpoint" : "Enable breakpoint"}
              className={`shrink-0 rounded p-0.5 transition-colors ${bp.enabled ? "text-error" : "text-text-muted"}`}
            >
              <IconBreakpointDot className="h-3 w-3" />
            </button>
            <span className="min-w-0 flex-1 truncate text-text-secondary">{relativePath}</span>
            <span className="shrink-0 text-text-muted">Ln {bp.line}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(bp.fileId, bp.line);
              }}
              aria-label="Remove breakpoint"
              title="Remove breakpoint"
              className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            >
              <IconTrash className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
