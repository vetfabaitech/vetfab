"use client";

/** Owns the multi-file editing session for the single Monaco editor
 * instance this app mounts -- one `ITextModel` per open file, created once
 * and reused for that file's whole lifetime, closely mirroring VS Code's
 * own split between `ICodeEditorService`/`IModelService` (the model/editor
 * layer) and the Workbench's editor-group UI (which this app's
 * `useEditorStore` tab list plays the role of).
 *
 * Why this exists instead of relying on `@monaco-editor/react`'s `path`
 * prop to swap files (the previous approach): that component's own
 * unmount path (`Editor.tsx`'s cleanup, triggered whenever `MultiFileEditor`
 * stopped rendering `<CodeEditor>` -- e.g. switching to the Log panel, or
 * closing the last tab) disposes both the *editor instance* and, unless
 * `keepCurrentModel` is set, the model that happened to be active at that
 * moment -- silently dropping that file's undo history and cursor/scroll
 * state even though its tab was still "open". `MultiFileEditor.tsx` now
 * keeps the editor permanently mounted (overlaying the Log panel/empty
 * state instead of unmounting it) and this module takes over model
 * creation/switching entirely, so nothing gets disposed except when a tab
 * is explicitly closed.
 *
 * `WorkspacePath` here is the same opaque file id used everywhere else in
 * this codebase (`useEditorStore`'s tabs, `useExplorerStore`'s nodes) --
 * it's the identifier `monaco.Uri.parse()` turns into each model's URI, so
 * it plays exactly the role a real workspace-relative path would in a
 * VS Code-style model registry.
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorNS, IDisposable, IPosition } from "monaco-editor";

export type WorkspacePath = string;

interface ActivateOptions {
  readOnly?: boolean;
}

interface OpenOptions extends ActivateOptions {
  /** Skip switching the editor onto this file after creating its model --
   * for pre-warming a model (e.g. so cross-file rename/peek has content to
   * work with) without disturbing what's currently on screen. */
  activate?: boolean;
}

class EditorManager {
  private editorInstance: MonacoEditorNS.IStandaloneCodeEditor | null = null;
  private monaco: Monaco | null = null;

  /** Map<WorkspacePath, MonacoModel> -- the single source of truth for
   * which files have a live model, in place of Monaco's own anonymous
   * `getModels()` registry. */
  private models = new Map<WorkspacePath, MonacoEditorNS.ITextModel>();
  private viewStates = new Map<WorkspacePath, MonacoEditorNS.ICodeEditorViewState>();
  private contentListeners = new Map<WorkspacePath, IDisposable>();
  private activePath: WorkspacePath | null = null;

  /** Supplies content/language for a file that has no model yet -- used by
   * `ensureModel` when navigation (go-to-definition, rename, peek) targets
   * a file that was never opened as a tab. Configured once from
   * `useLspClient.ts`, which has the live explorer tree. */
  private contentProvider: ((path: WorkspacePath) => { content: string; languageId: string } | undefined) | null =
    null;

  /** Fired on every real edit (not the initial `createModel` seed) so the
   * app's file-content store (`useExplorerStore`) stays in sync -- content
   * now flows model -> store, the reverse of the old `value` prop. */
  private onContentChange: ((path: WorkspacePath, content: string) => void) | null = null;

  configureContentProvider(fn: (path: WorkspacePath) => { content: string; languageId: string } | undefined): void {
    this.contentProvider = fn;
  }

  configureChangeListener(fn: (path: WorkspacePath, content: string) => void): void {
    this.onContentChange = fn;
  }

  /** Hands over the one live editor instance -- called from `CodeEditor`'s
   * `onMount` via `MultiFileEditor`. Safe to call again if Monaco ever
   * remounts the DOM node (e.g. hot reload); re-activates whatever was
   * active before. */
  attach(editorInstance: MonacoEditorNS.IStandaloneCodeEditor, monacoInstance: Monaco): void {
    this.editorInstance = editorInstance;
    this.monaco = monacoInstance;
    const disposeListener = editorInstance.onDidDispose(() => {
      disposeListener.dispose();
      if (this.editorInstance === editorInstance) {
        this.editorInstance = null;
        this.monaco = null;
      }
    });
    if (this.activePath) this.activateModel(this.activePath);
  }

  private uriFor(path: WorkspacePath): MonacoEditorNS.ITextModel["uri"] | null {
    return this.monaco ? this.monaco.Uri.parse(path) : null;
  }

  // -- model lifecycle -------------------------------------------------

  /** Idempotent: returns the existing model for `path` if there is one
   * instead of recreating it (undo history, decorations, and diagnostics
   * all live on the model object, so reuse is what preserves them). */
  createModel(path: WorkspacePath, content: string, languageId: string): MonacoEditorNS.ITextModel | null {
    const existing = this.models.get(path);
    if (existing) return existing;
    if (!this.monaco) return null;
    const uri = this.uriFor(path);
    if (!uri) return null;
    const model = this.monaco.editor.getModel(uri) ?? this.monaco.editor.createModel(content, languageId, uri);
    this.models.set(path, model);
    this.contentListeners.set(
      path,
      model.onDidChangeContent(() => this.onContentChange?.(path, model.getValue()))
    );
    return model;
  }

  /** Model for `path` if there is one already, otherwise creates it via the
   * configured content provider (for navigation targeting a file that was
   * never opened as a tab) -- returns null if neither has content for it. */
  ensureModel(path: WorkspacePath): MonacoEditorNS.ITextModel | null {
    const existing = this.models.get(path);
    if (existing) return existing;
    const source = this.contentProvider?.(path);
    if (!source) return null;
    return this.createModel(path, source.content, source.languageId);
  }

  getModel(path: WorkspacePath): MonacoEditorNS.ITextModel | null {
    return this.models.get(path) ?? null;
  }

  /** Reverse lookup for `lspNavigation.ts`'s editor-opener: given a Monaco
   * resource URI, finds which tracked path it belongs to -- covers both
   * open tabs and paths only pre-warmed via `ensureModel` (e.g. a
   * definition/rename target that was never opened as a tab). Needed
   * because once `ensureModel` has run for a path, any Location built from
   * it carries this manager's URI, not the raw LSP `file://` URI, so a
   * check against `useEditorStore`'s tabs alone misses it. */
  findPathForUri(monaco: Monaco, uriString: string): WorkspacePath | null {
    for (const path of this.models.keys()) {
      if (monaco.Uri.parse(path).toString() === uriString) return path;
    }
    return null;
  }

  /** Disposes `path`'s model and forgets its view state. If it's the model
   * currently showing, clears the editor first so Monaco never holds a
   * reference to a disposed model. */
  disposeModel(path: WorkspacePath): void {
    const model = this.models.get(path);
    if (!model) return;
    if (this.activePath === path) {
      this.editorInstance?.setModel(null);
      this.activePath = null;
    }
    this.contentListeners.get(path)?.dispose();
    this.contentListeners.delete(path);
    this.viewStates.delete(path);
    this.models.delete(path);
    model.dispose();
  }

  // -- activation --------------------------------------------------------

  /** Swaps the live editor onto `path`'s model, saving the outgoing file's
   * view state (cursor, scroll, folds, selections) and restoring the
   * incoming one -- the same save/restore Monaco's own editor-group UI
   * does when you switch tabs in real VS Code. No-ops (besides applying
   * `readOnly`) if `path` is already active, so callers don't need to
   * guard against redundant activation themselves. */
  activateModel(path: WorkspacePath, opts: ActivateOptions = {}): boolean {
    const editor = this.editorInstance;
    const model = this.models.get(path);
    if (!editor || !model) return false;

    if (this.activePath !== path) {
      if (this.activePath) {
        const savedState = editor.saveViewState();
        if (savedState) this.viewStates.set(this.activePath, savedState);
      }
      // The very first activation replaces @monaco-editor/react's anonymous
      // bootstrap model (created before this manager takes over) -- nothing
      // else disposes it, so do it here. Every later swap is a no-op check:
      // the outgoing model is always one of ours by then.
      const previous = editor.getModel();
      editor.setModel(model);
      if (previous && previous !== model && !this.isTrackedModel(previous)) previous.dispose();
      const incomingState = this.viewStates.get(path);
      if (incomingState) editor.restoreViewState(incomingState);
      this.activePath = path;
    }

    editor.updateOptions({ readOnly: opts.readOnly ?? false });
    return true;
  }

  private isTrackedModel(model: MonacoEditorNS.ITextModel): boolean {
    for (const tracked of this.models.values()) {
      if (tracked === model) return true;
    }
    return false;
  }

  /** High-level "open this file" -- ensures a model exists (creating it
   * from `content`/`languageId` if this is the first time) and, unless
   * `activate: false`, switches the editor onto it. */
  openFile(path: WorkspacePath, content: string, languageId: string, opts: OpenOptions = {}): void {
    this.createModel(path, content, languageId);
    if (opts.activate ?? true) this.activateModel(path, opts);
  }

  /** High-level "switch to an already-open tab" -- unlike `openFile`, does
   * not create a model; no-ops if `path` was never opened. */
  switchTab(path: WorkspacePath, opts: ActivateOptions = {}): boolean {
    if (!this.models.has(path)) return false;
    return this.activateModel(path, opts);
  }

  /** High-level "close this tab" -- disposes the model and, if it was
   * active, leaves the editor blank (the caller, `MultiFileEditor.tsx`, is
   * expected to activate whatever tab should become active next, exactly
   * like closing the active tab in VS Code moves focus to a neighbor). */
  closeFile(path: WorkspacePath): void {
    this.disposeModel(path);
  }

  /** Go-to-definition/find-references/rename entry point: ensures a model
   * exists for `path` (creating one via the content provider if it was
   * never opened), activates it, and moves the cursor to `position` --
   * synchronously, since model activation here is a direct imperative
   * `setModel` call rather than something waiting on a React re-render. */
  revealLocation(path: WorkspacePath, position: IPosition, opts: ActivateOptions = {}): boolean {
    const model = this.ensureModel(path);
    if (!model) return false;
    if (!this.activateModel(path, opts)) return false;
    const editor = this.editorInstance;
    if (!editor) return false;
    editor.setPosition(position);
    editor.revealPositionInCenterIfOutsideViewport(position);
    editor.focus();
    return true;
  }

  getActivePath(): WorkspacePath | null {
    return this.activePath;
  }

  /** The one live editor instance, for hooks that need to attach their own
   * listeners (cursor position, scroll, content) directly -- e.g. the
   * cursor inspector/sticky header telemetry wired up in
   * `MultiFileEditor.tsx`. Null before the first `attach()`. */
  getEditorInstance(): MonacoEditorNS.IStandaloneCodeEditor | null {
    return this.editorInstance;
  }

  /** Quick Action Toolbar's Undo/Redo -- delegates to Monaco's own undo
   * stack (per-model, so this always affects whichever file is active)
   * rather than reimplementing history tracking. */
  undo(): void {
    this.editorInstance?.trigger("quickActionToolbar", "undo", null);
  }

  redo(): void {
    this.editorInstance?.trigger("quickActionToolbar", "redo", null);
  }

  /** Replaces `path`'s entire buffer with `formatted` as a single undoable
   * edit (so one Ctrl+Z reverts the format, not each individual line) --
   * used by MultiFileEditor's Ctrl+S handler once `formatFileOnSave` has
   * returned Verible's output. `onDidChangeContent` fires from this exactly
   * like a normal keystroke, so the explorer store's content/dirty state
   * stays in sync automatically. */
  applyFormattedText(path: WorkspacePath, formatted: string): void {
    const model = this.models.get(path);
    if (!model || !this.monaco) return;
    const lineCount = model.getLineCount();
    const fullRange = new this.monaco.Range(1, 1, lineCount, model.getLineMaxColumn(lineCount));
    model.pushEditOperations([], [{ range: fullRange, text: formatted }], () => null);
  }

  /** Briefly flashes `line`'s full width -- called after `revealLocation` by
   * the Problems panel (see `useProblems.ts`/`ProblemsPanel.tsx`) so a
   * clicked diagnostic draws the eye beyond just moving the cursor there.
   * No-ops if `path` isn't the currently active model (the caller is
   * expected to have just activated it via `revealLocation`). */
  flashLine(path: WorkspacePath, line: number): void {
    const editor = this.editorInstance;
    const model = this.models.get(path);
    if (!editor || !model || !this.monaco || this.activePath !== path) return;
    const collection = editor.createDecorationsCollection([
      {
        range: new this.monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: { isWholeLine: true, className: "problem-highlight-line" },
      },
    ]);
    setTimeout(() => collection.clear(), 1200);
  }
}

/** One editor pane for the whole app -- see the module doc for why a
 * singleton (mirrors `lspConnection.ts`'s per-project connection map, just
 * simpler since there's exactly one visible editor at a time). */
export const editorManager = new EditorManager();
