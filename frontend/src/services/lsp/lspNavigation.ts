"use client";

/** Bridges LSP navigation (Go To Definition, Peek Definition, Find
 * References, Peek References) onto this codebase's *existing* tab system
 * -- `EditorTabBar.tsx` / `useEditorStore` / `FileTree.tsx`'s "open file"
 * flow -- instead of building a second, parallel file-opening mechanism.
 *
 * Why this is needed at all: `lspConnection.ts` already registers
 * `registerDefinitionProvider`/`registerReferenceProvider`, and svlangserver
 * returns correct results for actual LSP methods it implements (confirmed
 * via hover/definition round-trips -- `textDocument/references` itself is
 * NOT one of them; see `textSearchReferences.ts`'s doc for the client-side
 * fallback that covers that gap) -- but bare `monaco-editor` (this codebase
 * deliberately avoids `@codingame/monaco-vscode-api`, see `lspConnection.ts`'s
 * module doc) has no built-in notion of multiple editor panes/tabs. Its
 * `StandaloneCodeEditorService.openCodeEditor` -- what Monaco's built-in
 * goToDefinition/peek/references commands call under the hood -- does
 * *nothing* for a resource outside the currently-focused model unless an
 * opener is registered via `monaco.editor.registerEditorOpener`. Without
 * this module, cross-file navigation was therefore a silent no-op, even
 * though the LSP round-trip itself worked correctly.
 *
 * `registerLspNavigation` (called from `useLspClient.ts`) installs that
 * opener. It never creates tabs/models itself -- it resolves the target
 * file id, delegates to the same `useEditorStore`/`useExplorerStore`
 * actions `FileTree.tsx` uses for a manual click (so the tab bar reflects
 * the navigation), and hands the actual model activation + cursor move to
 * `EditorManager`, which does it synchronously (no waiting on a React
 * re-render -- see `EditorManager.ts`).
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorNS, IDisposable, IPosition, IRange, languages, Uri } from "monaco-editor";
import { useEditorStore } from "@/store/editorStore";
import { useExplorerStore } from "@/store/explorerStore";
import { editorManager } from "@/services/editor/EditorManager";
import { peekLspConnection } from "./lspConnection";
import { fileIdForRelativePath } from "./workspacePaths";
import { searchWholeWordReferences } from "./textSearchReferences";

/** Maps a Monaco `Location.uri` (produced by `lspMonacoMapping.ts`'s
 * `toMonacoLocation`) back to the explorer tree's file id. Two cases: the
 * target already has a model -- either an open tab, or a file
 * `lspConnection.ts`'s `ensureMonacoUriFor` pre-warmed via `EditorManager`
 * (e.g. a definition/rename target that was never opened as a tab; once
 * that's happened, the Location carries this manager's URI, not the raw
 * LSP one, so `EditorManager.findPathForUri` -- not just open tabs -- has
 * to be checked first) -- or it's never been touched at all, in which case
 * the Location still carries the raw LSP `file://` URI, resolved by
 * stripping the workspace root and walking the explorer tree. */
function resolveFileId(monaco: Monaco, projectId: string, resourceUriString: string): string | null {
  const viaModel = editorManager.findPathForUri(monaco, resourceUriString);
  if (viaModel) return viaModel;

  const connection = peekLspConnection(projectId);
  const relativePath = connection?.relativePathForLspUri(resourceUriString);
  if (!relativePath) return null;

  const { nodes, rootId } = useExplorerStore.getState();
  return fileIdForRelativePath(relativePath, nodes, rootId);
}

/** The `ICodeEditorOpener.openCodeEditor` implementation registered below.
 * Activates (or opens) the target file's tab via the same store actions
 * `FileTree.tsx` uses for a manual click, then hands off to
 * `EditorManager.revealLocation` to swap the model and move the cursor. */
function openLspLocation(
  monaco: Monaco,
  projectId: string,
  resource: Uri,
  selectionOrPosition?: IRange | IPosition
): boolean {
  const fileId = resolveFileId(monaco, projectId, resource.toString());
  if (!fileId) return false;

  const explorer = useExplorerStore.getState();
  const node = explorer.nodes[fileId];
  if (!node || node.kind !== "file") return false;

  // Same open/activate-tab flow FileTree.tsx's row click uses -- no
  // separate file-opening logic.
  explorer.openFile(fileId);
  useEditorStore.getState().openFile(fileId);

  const position: IPosition = selectionOrPosition
    ? "lineNumber" in selectionOrPosition
      ? { lineNumber: selectionOrPosition.lineNumber, column: selectionOrPosition.column }
      : { lineNumber: selectionOrPosition.startLineNumber, column: selectionOrPosition.startColumn }
    : { lineNumber: 1, column: 1 };

  return editorManager.revealLocation(fileId, position, { readOnly: !!(node.readOnly || node.locked) });
}

/** Pre-creates a model for whatever file `lspUri` points at, if it doesn't
 * have one yet, and returns the resulting Monaco URI string so
 * `lspConnection.ts` can remember the mapping. Wired in via
 * `setEnsureModelHook` and called before definition/reference results and
 * rename edits are handed to Monaco: Monaco's standalone
 * `IBulkEditService`/reference-peek preview both require a model to already
 * exist for a resource -- `StandaloneBulkEditService.apply` throws "model
 * not found" outright for any resource without one -- so without this, a
 * rename or peek touching a file that was never opened as a tab would
 * silently fail (rename) or show a blank preview (peek), even though the
 * LSP edit/location itself was correct. */
export function ensureModelForLspUri(monaco: Monaco, projectId: string, lspUri: string): string | undefined {
  const connection = peekLspConnection(projectId);
  const relativePath = connection?.relativePathForLspUri(lspUri);
  if (!relativePath) return undefined;
  const { nodes, rootId } = useExplorerStore.getState();
  const fileId = fileIdForRelativePath(relativePath, nodes, rootId);
  if (!fileId) return undefined;
  const model = editorManager.ensureModel(fileId);
  return model ? monaco.Uri.parse(fileId).toString() : undefined;
}

/** Client-side Find All References fallback -- see `textSearchReferences.ts`
 * for why svlangserver can never answer `textDocument/references` itself.
 * Wired into `lspConnection.ts` via `setTextSearchHook` and used whenever
 * the real LSP request comes back empty/erroring. Resolves each text match
 * to a Monaco `Location`, pre-warming a model for its file (via
 * `EditorManager.ensureModel`) the same way `ensureModelForLspUri` does, so
 * the references peek widget has content to preview and "go to" works
 * immediately. */
export function searchTextReferences(monaco: Monaco, word: string): languages.Location[] {
  const { nodes, rootId } = useExplorerStore.getState();
  const matches = searchWholeWordReferences(word, nodes, rootId);
  const locations: languages.Location[] = [];
  for (const match of matches) {
    const fileId = fileIdForRelativePath(match.path, nodes, rootId);
    if (!fileId || !editorManager.ensureModel(fileId)) continue;
    locations.push({
      uri: monaco.Uri.parse(fileId),
      range: {
        startLineNumber: match.line + 1,
        startColumn: match.startColumn + 1,
        endLineNumber: match.line + 1,
        endColumn: match.endColumn + 1,
      },
    });
  }
  return locations;
}

/** Registers the opener that lets Monaco's built-in Go To Definition, Peek
 * Definition, Find References, and Peek References commands (all driven by
 * the `registerDefinitionProvider`/`registerReferenceProvider` calls in
 * `lspConnection.ts`) navigate across files and tabs. Call once per
 * `monaco` instance (see `useLspClient.ts`); returns a disposable. */
export function registerLspNavigation(monaco: Monaco, projectId: string): IDisposable {
  return monaco.editor.registerEditorOpener({
    openCodeEditor: (_source: MonacoEditorNS.ICodeEditor, resource: Uri, selectionOrPosition?: IRange | IPosition) =>
      openLspLocation(monaco, projectId, resource, selectionOrPosition),
  });
}
