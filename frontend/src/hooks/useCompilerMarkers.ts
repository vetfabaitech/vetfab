"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { TreeNode } from "@/types/explorer";
import { CompilerDiagnostic, parseCompilerOutput } from "@/services/diagnostics/compilerOutputParser";
import { fileIdForRelativePath } from "@/services/lsp/workspacePaths";

interface UseCompilerMarkersParams {
  monaco: Monaco | null;
  nodes: Record<string, TreeNode>;
  rootId: string;
}

interface ApplyResult {
  /** fileIds with at least one error-severity diagnostic in this chunk --
   * used by the Explorer's "Contains errors" badge (Feature 2), which needs
   * a signal that survives a file's tab being closed (Monaco markers alone
   * don't, since they're only ever painted onto an already-open model --
   * same limitation `useVerilatorLint.ts` already has). */
  erroredFileIds: string[];
}

/** Paints compile-stage output (see `compilerOutputParser.ts`) as Monaco
 * markers under the "compiler" owner, the same way `useVerilatorLint.ts`
 * paints Verilator's under "verilator" -- both coexist per model, and both
 * flow into the Problems panel automatically via `useProblems.ts`'s marker
 * mirror. Markers are only set on files that already have an open model
 * (same restriction Verilator lint has); `erroredFileIds` is returned
 * separately so callers can still flag closed files via the Explorer badge. */
export function useCompilerMarkers({ monaco, nodes, rootId }: UseCompilerMarkersParams) {
  const markedFilesRef = useRef<Set<string>>(new Set());

  const clear = useCallback(() => {
    if (!monaco) return;
    for (const fileId of markedFilesRef.current) {
      const model = monaco.editor.getModel(monaco.Uri.parse(fileId));
      if (model) monaco.editor.setModelMarkers(model, "compiler", []);
    }
    markedFilesRef.current = new Set();
  }, [monaco]);

  const apply = useCallback(
    // `structuredDiagnostics` is the backend-parsed array from the WS
    // `output` message (stream: "compiler") -- see compilerOutputParser.ts's
    // module doc. Preferred when present; `text` is only re-parsed
    // client-side as a fallback (e.g. no `diagnostics` field on the message).
    (text: string, structuredDiagnostics?: CompilerDiagnostic[]): ApplyResult => {
      if (!monaco) return { erroredFileIds: [] };
      const diagnostics = structuredDiagnostics && structuredDiagnostics.length > 0 ? structuredDiagnostics : parseCompilerOutput(text);
      if (diagnostics.length === 0) return { erroredFileIds: [] };

      const byFile = new Map<string, typeof diagnostics>();
      for (const d of diagnostics) {
        const list = byFile.get(d.file) ?? [];
        list.push(d);
        byFile.set(d.file, list);
      }

      const erroredFileIds: string[] = [];
      for (const [relativePath, fileDiagnostics] of byFile) {
        const fileId = fileIdForRelativePath(relativePath, nodes, rootId);
        if (!fileId) continue;
        if (fileDiagnostics.some((d) => d.severity === "error")) erroredFileIds.push(fileId);

        const model = monaco.editor.getModel(monaco.Uri.parse(fileId));
        if (!model) continue;
        markedFilesRef.current.add(fileId);
        monaco.editor.setModelMarkers(
          model,
          "compiler",
          fileDiagnostics.map((d) => ({
            startLineNumber: d.line,
            startColumn: d.column ?? 1,
            endLineNumber: d.line,
            endColumn: model.getLineMaxColumn(d.line),
            // `d.message` already includes "[CODE] " when the backend's
            // parser attached one (see parse_verilator_diagnostics) -- don't
            // re-prepend `d.code` here or it would appear twice.
            message: d.message,
            severity: d.severity === "error" ? 8 : 4,
            source: "compiler",
          }))
        );
      }
      return { erroredFileIds };
    },
    [monaco, nodes, rootId]
  );

  return useMemo(() => ({ apply, clear }), [apply, clear]);
}
