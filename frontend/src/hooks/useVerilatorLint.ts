"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { TreeNode } from "@/types/explorer";
import { lintProject, type LintDiagnostic } from "@/services/lsp/verilatorLint";
import { flattenWorkspaceFiles, relativePathFor } from "@/services/lsp/workspacePaths";

const DEBOUNCE_MS = 800; // matches settings.verilator_debounce_ms on the backend

interface EditorTabLike {
  fileId: string;
}

interface UseVerilatorLintParams {
  monaco: Monaco | null;
  apiUrl: string;
  projectId: string;
  nodes: Record<string, TreeNode>;
  rootId: string;
  tabs: EditorTabLike[];
}

interface UseVerilatorLintResult {
  /** Bypasses the debounce for an explicit save (Ctrl+S) or the Quick Action
   * Toolbar's Compile button -- returns the in-flight lint call so callers
   * that want a loading state (the toolbar) can await it. */
  lintNow: () => Promise<void>;
}

/** Runs `POST /api/v1/lint` after `DEBOUNCE_MS` of no further edits (or
 * immediately via `lintNow`, for on-save), and paints the results as Monaco
 * markers on whichever of the returned files are currently open as tabs.
 * Verilator itself is only ever invoked by the backend on these calls --
 * never continuously. */
export function useVerilatorLint({
  monaco,
  apiUrl,
  projectId,
  nodes,
  rootId,
  tabs,
}: UseVerilatorLintParams): UseVerilatorLintResult {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mutable snapshot so `lintNow`/the debounce timer always see the latest
  // tree/tabs without re-subscribing the effect (and re-arming the debounce)
  // on every keystroke. Updated in an effect, never during render.
  const latest = useRef({ nodes, rootId, tabs });
  useEffect(() => {
    latest.current = { nodes, rootId, tabs };
  }, [nodes, rootId, tabs]);

  const runLint = useCallback(async () => {
    if (!monaco) return;
    const { nodes: currentNodes, rootId: currentRootId, tabs: currentTabs } = latest.current;
    const files = flattenWorkspaceFiles(currentNodes, currentRootId).filter((f) => /\.(v|sv|svh|vh)$/i.test(f.path));
    if (files.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let diagnostics: LintDiagnostic[];
    try {
      diagnostics = await lintProject(apiUrl, projectId, files, controller.signal);
    } catch {
      return; // aborted, or Verilator/network unavailable -- leave existing markers as-is
    }

    const byPath = new Map<string, LintDiagnostic[]>();
    for (const d of diagnostics) {
      const list = byPath.get(d.file) ?? [];
      list.push(d);
      byPath.set(d.file, list);
    }

    for (const tab of currentTabs) {
      const relativePath = relativePathFor(tab.fileId, currentNodes);
      if (!relativePath) continue;
      const model = monaco.editor.getModel(monaco.Uri.parse(tab.fileId));
      if (!model) continue;
      const fileDiagnostics = byPath.get(relativePath) ?? [];
      monaco.editor.setModelMarkers(
        model,
        "verilator",
        fileDiagnostics.map((d) => ({
          startLineNumber: d.line,
          startColumn: d.column,
          endLineNumber: d.line,
          endColumn: d.column + 1,
          message: d.code ? `${d.message} [${d.code}]` : d.message,
          severity: d.monacoSeverity as 1 | 2 | 4 | 8,
          source: d.source,
        }))
      );
    }
  }, [monaco, apiUrl, projectId]);

  const lintNow = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    return runLint();
  }, [runLint]);

  useEffect(() => {
    if (!monaco) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runLint(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Re-arm whenever file content/structure changes -- `nodes` is a fresh
    // object identity on every edit (see explorerStore.updateFileContent).
  }, [monaco, nodes, runLint]);

  return { lintNow };
}
