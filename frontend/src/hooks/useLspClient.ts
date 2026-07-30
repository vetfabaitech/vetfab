"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import type { FileNodeData, TreeNode } from "@/types/explorer";
import { acquireLspConnection, peekLspConnection } from "@/services/lsp/lspConnection";
import { ensureModelForLspUri, registerLspNavigation, searchTextReferences } from "@/services/lsp/lspNavigation";
import { flattenWorkspaceFiles, relativePathFor } from "@/services/lsp/workspacePaths";
import { editorManager } from "@/services/editor/EditorManager";
import { getMonacoLanguage } from "@/services/editor/languageMapping";
import { extname } from "@/utils/format";

const CHANGE_DEBOUNCE_MS = 250;

interface EditorTabLike {
  fileId: string;
}

interface UseLspClientParams {
  /** Falsy disables the hook entirely (e.g. Monaco not mounted yet). */
  monaco: Monaco | null;
  projectId: string;
  apiUrl: string;
  wsUrl: string;
  tabs: EditorTabLike[];
  activeTabId: string | null;
  nodes: Record<string, TreeNode>;
  rootId: string;
}

/** Keeps one project's svlangserver connection's open-document set in sync
 * with the editor's open tabs, and streams the active tab's edits over
 * `textDocument/didChange` (debounced). Mirrors the existing
 * `previousOpenIdsRef` model-disposal effect in `MultiFileEditor.tsx` for
 * the open/close diffing, since LSP documents need the same lifecycle. */
export function useLspClient({
  monaco,
  projectId,
  apiUrl,
  wsUrl,
  tabs,
  activeTabId,
  nodes,
  rootId,
}: UseLspClientParams): void {
  const previousOpenRef = useRef<Set<string>>(new Set());
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!monaco) return;
    const connection = acquireLspConnection(projectId, wsUrl, apiUrl, monaco);
    return () => connection.release();
  }, [monaco, projectId, apiUrl, wsUrl]);

  // Lets Monaco's built-in Go To Definition/Peek Definition/Find References/
  // Peek References commands open results in this app's own tab system --
  // see lspNavigation.ts for why bare monaco-editor needs this at all.
  useEffect(() => {
    if (!monaco) return;
    const disposable = registerLspNavigation(monaco, projectId);
    return () => disposable.dispose();
  }, [monaco, projectId]);

  // EditorManager.ensureModel's content source for files that were never
  // opened as a tab (go-to-definition/peek/rename targets) -- reads the
  // same in-memory tree content FileTree.tsx opens files from.
  useEffect(() => {
    editorManager.configureContentProvider((fileId) => {
      const node = nodes[fileId] as FileNodeData | undefined;
      if (!node || node.kind !== "file") return undefined;
      return { content: node.content ?? "", languageId: getMonacoLanguage(extname(node.name)) };
    });
  }, [nodes]);

  // Lets definition/reference results and rename edits pre-create a model
  // for a file they target that was never opened -- see
  // ensureModelForLspUri's doc for why this isn't just an optimization.
  useEffect(() => {
    if (!monaco) return;
    const connection = peekLspConnection(projectId);
    connection?.setEnsureModelHook((lspUri) => ensureModelForLspUri(monaco, projectId, lspUri));
    return () => connection?.setEnsureModelHook(null);
  }, [monaco, projectId]);

  // Client-side Find All References fallback -- svlangserver has no
  // textDocument/references support at all (see textSearchReferences.ts).
  useEffect(() => {
    if (!monaco) return;
    const connection = peekLspConnection(projectId);
    connection?.setTextSearchHook((word) => searchTextReferences(monaco, word));
    return () => connection?.setTextSearchHook(null);
  }, [monaco, projectId]);

  // Signature of the tree's file *paths* (not contents): changes when a file
  // is added/removed/renamed or a whole different folder is opened -- exactly
  // the moments svlangserver's on-disk view goes stale.
  const pathsSignature = useMemo(
    () =>
      flattenWorkspaceFiles(nodes, rootId)
        .map((f) => f.path)
        .sort()
        .join("\n"),
    [nodes, rootId]
  );

  useEffect(() => {
    if (!monaco) return;
    // Seed/re-sync the backend's on-disk workspace (see
    // app/workspace/manager.py) so svlangserver's indexer sees the current
    // tree, then ask it to rebuild its index. Runs on mount and again on any
    // file-set change -- content-only edits are excluded (pathsSignature is
    // path-based) and flow via /lint saves + textDocument/didChange instead.
    let cancelled = false;
    fetch(`${apiUrl}/api/v1/workspace/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, files: flattenWorkspaceFiles(nodes, rootId) }),
    })
      .then(() => {
        if (!cancelled) return peekLspConnection(projectId)?.rebuildIndex();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `nodes`/`rootId` are read but deliberately not deps -- pathsSignature
    // already derives from them, and re-seeding on every keystroke would
    // thrash the indexer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, projectId, apiUrl, pathsSignature]);

  useEffect(() => {
    if (!monaco) return;
    const connection = peekLspConnection(projectId);
    if (!connection) return; // the lifecycle effect above hasn't acquired it yet

    const currentIds = new Set(tabs.map((t) => t.fileId));
    for (const fileId of currentIds) {
      if (previousOpenRef.current.has(fileId)) continue;
      const node = nodes[fileId] as FileNodeData | undefined;
      const relativePath = relativePathFor(fileId, nodes);
      if (!node || node.kind !== "file" || !relativePath) continue;
      const monacoUriString = monaco.Uri.parse(fileId).toString();
      connection.openDocument(monacoUriString, relativePath, "systemverilog", node.content ?? "");
    }
    for (const fileId of previousOpenRef.current) {
      if (currentIds.has(fileId)) continue;
      const monacoUriString = monaco.Uri.parse(fileId).toString();
      connection.closeDocument(monacoUriString);
    }
    previousOpenRef.current = currentIds;
  }, [monaco, projectId, wsUrl, tabs, nodes]);

  useEffect(() => {
    if (!monaco || !activeTabId) return;
    const node = nodes[activeTabId] as FileNodeData | undefined;
    if (!node || node.kind !== "file") return;

    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    changeTimerRef.current = setTimeout(() => {
      const connection = peekLspConnection(projectId);
      if (!connection) return;
      const monacoUriString = monaco.Uri.parse(activeTabId).toString();
      connection.updateDocument(monacoUriString, node.content ?? "");
    }, CHANGE_DEBOUNCE_MS);

    return () => {
      if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, projectId, wsUrl, activeTabId, nodes[activeTabId ?? ""]?.kind === "file" ? (nodes[activeTabId ?? ""] as FileNodeData).content : undefined]);
}
