"use client";

import { useEffect, useMemo, useState } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { TreeNode } from "@/types/explorer";
import type { ProblemEntry, ProblemSeverity } from "@/types/diagnostics";
import { editorManager } from "@/services/editor/EditorManager";
import { relativePathFor } from "@/services/lsp/workspacePaths";

const SEVERITY_BY_MONACO: Record<number, ProblemSeverity> = {
  8: "error", // MarkerSeverity.Error
  4: "warning", // MarkerSeverity.Warning
  2: "info", // MarkerSeverity.Info
  1: "info", // MarkerSeverity.Hint
};

interface UseProblemsParams {
  monaco: Monaco | null;
  nodes: Record<string, TreeNode>;
}

/** Mirrors Monaco's own marker service into a flat, file-grouped Problems
 * list. Every diagnostic pipeline this app has (LSP/svlangserver, Verilator
 * lint, and the compiler-output parser added for Feature 1) already paints
 * results via `monaco.editor.setModelMarkers` under its own owner name --
 * Monaco's marker table is therefore already a complete, de-duplicated
 * diagnostics store. Re-deriving from it here (instead of introducing a
 * fourth, parallel "problems" store) keeps the panel automatically in sync
 * with whichever pipeline last ran, with no risk of drifting from what's
 * actually underlined in the editor. */
export function useProblems({ monaco, nodes }: UseProblemsParams): ProblemEntry[] {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!monaco) return;
    const disposable = monaco.editor.onDidChangeMarkers(() => setVersion((v) => v + 1));
    return () => disposable.dispose();
  }, [monaco]);

  return useMemo(() => {
    if (!monaco) return [];
    const markers = monaco.editor.getModelMarkers({});
    const entries: ProblemEntry[] = [];
    for (const marker of markers) {
      const fileId = editorManager.findPathForUri(monaco, marker.resource.toString());
      if (!fileId) continue;
      const node = nodes[fileId];
      if (!node || node.kind !== "file") continue;

      entries.push({
        id: `${fileId}:${marker.owner ?? "unknown"}:${marker.startLineNumber}:${marker.startColumn}:${entries.length}`,
        fileId,
        filePath: relativePathFor(fileId, nodes) ?? node.name,
        fileName: node.name,
        line: marker.startLineNumber,
        column: marker.startColumn,
        endLine: marker.endLineNumber,
        endColumn: marker.endColumn,
        message: marker.message,
        severity: SEVERITY_BY_MONACO[marker.severity] ?? "info",
        source: marker.owner ?? "unknown",
      });
    }
    entries.sort(
      (a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.column - b.column
    );
    return entries;
    // `version` intentionally participates only to re-run this derivation --
    // Monaco's marker table itself is the actual data source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, nodes, version]);
}
