"use client";

/** One project's connection to its svlangserver process, proxied through
 * `WS /ws/lsp/{projectId}` (see `backend/app/websocket/lsp_ws.py`).
 *
 * Deliberately built directly on `vscode-jsonrpc` + `vscode-ws-jsonrpc`
 * (both published from the `TypeFox/monaco-languageclient` repo) rather
 * than that repo's top-level `monaco-languageclient` package: as of v7,
 * `MonacoLanguageClient` requires initializing `@codingame/monaco-vscode-api`
 * (a large VSCode-services shim) before it can be constructed, which is
 * built around *replacing* `@monaco-editor/react`'s editor host entirely --
 * not compatible with bolting an LSP client onto an already-mounted
 * `@monaco-editor/react` instance, which is what this codebase's existing
 * editor components (`CodeEditor.tsx`/`MultiFileEditor.tsx`) need. The
 * transport layer (`vscode-ws-jsonrpc`) has no such requirement, so this
 * module speaks JSON-RPC directly and registers plain
 * `monaco.languages.register*Provider` callbacks by hand -- functionally
 * equivalent for the feature set this MVP needs (completion, hover,
 * signature help, definition, references, rename, document/workspace
 * symbols), without requiring a rewrite of the editor host.
 *
 * One connection (and one svlangserver process, per `LspProcessManager`)
 * per project id, shared by every open tab/model for that project.
 */

import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorNS, IDisposable, IRange, languages, Position } from "monaco-editor";
import { createMessageConnection, type MessageConnection } from "vscode-jsonrpc";
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";

import {
  toLspPosition,
  toLspRange,
  toMonacoCompletionItem,
  toMonacoDocumentSymbol,
  toMonacoHoverContents,
  toMonacoLocation,
  toMonacoRange,
  toMonacoSignatureHelp,
  toMonacoTextEdits,
} from "./lspMonacoMapping";
import type {
  LspCompletionList,
  LspDiagnostic,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspPublishDiagnosticsParams,
  LspSignatureHelp,
  LspSymbolInformation,
  LspTextEdit,
  LspWorkspaceEdit,
} from "./lspTypes";

const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { didSave: true, willSave: false, dynamicRegistration: false },
    completion: { completionItem: { snippetSupport: false, documentationFormat: ["markdown", "plaintext"] } },
    hover: { contentFormat: ["markdown", "plaintext"] },
    signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"] } },
    definition: { linkSupport: false },
    references: {},
    rename: { prepareSupport: false },
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    publishDiagnostics: { relatedInformation: false },
  },
  // `configuration: true` is load-bearing: it makes svlangserver PULL settings
  // from us via a workspace/configuration request during its first (and only
  // reliable) indexing pass -- see the onRequest handler in connect(). Pushing
  // the same settings later via didChangeConfiguration does NOT re-index.
  workspace: { symbol: {}, workspaceFolders: true, configuration: true },
};

/** Settings svlangserver requests via workspace/configuration (section
 * "systemverilog", keys without the prefix). The default includeIndexing only
 * covers .sv/.svh -- without adding .v/.vh here, plain-Verilog projects get
 * "Cannot find file containing module" squiggles and no cross-file
 * definition/symbols. */
const SVLANGSERVER_SETTINGS = {
  includeIndexing: ["**/*.{v,vh,sv,svh}"],
  // --timing: Verilator 5.x otherwise errors out on testbench `#delay`s.
  launchConfiguration: "verilator -sv --lint-only -Wall --timing -Wno-TIMESCALEMOD -Wno-DECLFILENAME",
  formatCommand: "verible-verilog-format",
};

const RECONNECT_DELAY_MS = 3000;

interface OpenDocument {
  monacoUriString: string;
  /** Workspace-relative path, e.g. "rtl/adder.sv" -- the LSP file:// URI is
   * derived from it once the workspace's real root path is known. */
  relativePath: string;
  languageId: string;
  version: number;
  /** Set by `ensureOpened` after `initialize` fetched the root path. */
  lspUri?: string;
  opened: boolean;
  initialText: string;
}

/** LSP document (`textDocument/didOpen` etc.) diagnostics severity -> Monaco
 * `MarkerSeverity`. Same numeric scale used by `app/models/diagnostic.py`
 * on the backend for the separate `/lint` (Verilator) pipeline. */
function severityToMonaco(severity: number | undefined): MonacoEditorNS.IMarkerData["severity"] {
  switch (severity) {
    case 1:
      return 8; // Error
    case 2:
      return 4; // Warning
    case 3:
      return 2; // Info
    default:
      return 1; // Hint
  }
}

export class ProjectLspConnection {
  private connection: MessageConnection | null = null;
  private socket: WebSocket | null = null;
  private closed = false;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private documents = new Map<string, OpenDocument>(); // key: monacoUriString
  private lspUriToMonacoUri = new Map<string, string>();
  private providerDisposables: IDisposable[] = [];
  private refCount = 0;
  /** The backend workspace's real on-disk directory (posix), fetched from
   * POST /workspace/create before `initialize`. svlangserver resolves the
   * rootUri/document URIs against the actual filesystem -- with made-up
   * paths its indexer ENOENTs and definition/references return nothing. */
  private rootPath: string | null = null;
  /** Set by `useLspClient.ts` via `setEnsureModelHook` -- lets definition/
   * reference/rename results pre-warm a Monaco model (returning its URI
   * string) for files they target that were never opened as a tab. See
   * `ensureModelForLspUri`'s doc in `lspNavigation.ts` for why that's
   * required, not just an optimization -- Monaco's standalone bulk-edit
   * service throws outright for a resource with no existing model. */
  private ensureModelForUri: ((lspUri: string) => string | undefined) | null = null;
  /** Set by `useLspClient.ts` via `setTextSearchHook` -- the client-side
   * Find All References fallback (`textSearchReferences.ts`), used because
   * this svlangserver build has no `textDocument/references` support at
   * all (confirmed via its own capabilities response and source -- not a
   * transient failure). */
  private textSearchHook: ((word: string) => languages.Location[]) | null = null;

  constructor(
    private readonly projectId: string,
    private readonly wsUrl: string,
    private readonly apiUrl: string,
    private readonly monaco: Monaco
  ) {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.connect();
    this.registerProviders();
  }

  /** Two open tabs of the same project share one connection -- this just
   * tracks how many callers currently hold a reference so `release()` only
   * tears things down once nobody needs it anymore. */
  acquire(): void {
    this.refCount += 1;
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.dispose();
  }

  private connect(): void {
    if (this.closed) return;
    const socket = new WebSocket(`${this.wsUrl}/ws/lsp/${encodeURIComponent(this.projectId)}`);
    this.socket = socket;

    socket.onopen = () => {
      const webSocket = toSocket(socket);
      const reader = new WebSocketMessageReader(webSocket);
      const writer = new WebSocketMessageWriter(webSocket);
      const connection = createMessageConnection(reader, writer);

      connection.onNotification("textDocument/publishDiagnostics", (params: LspPublishDiagnosticsParams) => {
        this.applyDiagnostics(params);
      });

      // svlangserver pulls its settings (indexing globs, tool commands)
      // through this request right after `initialized` -- one response object
      // per requested item.
      connection.onRequest("workspace/configuration", (params: { items: unknown[] }) =>
        params.items.map(() => SVLANGSERVER_SETTINGS)
      );

      connection.listen();
      this.connection = connection;
      // Fire-and-forget: initialize() can reject (the socket drops mid-
      // request, svlangserver errors) -- left unhandled, that surfaces as a
      // full-page "unhandled promise rejection" overlay instead of the
      // graceful retry `onclose`'s reconnect already provides. Swallow it
      // here; `this.ready` simply stays unresolved until the next
      // successful (re)connect calls resolveReady().
      this.initialize().catch((err) => {
        console.warn(`LSP initialize failed for project '${this.projectId}':`, err);
      });
    };

    socket.onclose = () => {
      this.connection = null;
      if (!this.closed) setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    };

    socket.onerror = () => {
      // onclose fires right after -- reconnect handled there.
    };
  }

  private async fetchRootPath(): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: this.projectId }),
      });
      if (response.ok) {
        const data: { workspacePath?: string } = await response.json();
        if (data.workspacePath) return data.workspacePath;
      }
    } catch {
      // fall through to the degraded default below
    }
    return `/${this.projectId}`; // degraded: LSP still connects, cross-file features won't resolve
  }

  private rootUri(): string {
    const path = this.rootPath ?? `/${this.projectId}`;
    return `file://${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private lspUriFor(relativePath: string): string {
    return `${this.rootUri()}/${relativePath}`;
  }

  /** Reverse of `lspUriFor` -- strips this connection's workspace root off
   * an LSP `file://` URI, giving the workspace-relative path (e.g.
   * "rtl/alu.v"). Used by `lspNavigation.ts` to resolve a definition/
   * reference Location that points at a file which was never opened as an
   * LSP document (so `lspUriToMonacoUri` has no entry for it) back to a
   * node in the explorer tree. Returns null for a URI outside this
   * workspace. */
  relativePathForLspUri(lspUri: string): string | null {
    const prefix = `${this.rootUri()}/`;
    if (!lspUri.startsWith(prefix)) return null;
    try {
      return decodeURIComponent(lspUri.slice(prefix.length));
    } catch {
      return lspUri.slice(prefix.length);
    }
  }

  private async initialize(): Promise<void> {
    if (!this.connection) return;
    this.rootPath = await this.fetchRootPath();
    if (!this.connection) return; // socket dropped while fetching
    const rootUri = this.rootUri();
    await this.connection.sendRequest("initialize", {
      processId: null,
      rootUri,
      rootPath: this.rootPath,
      // svlangserver branches on clientInfo.name and crashes its initialize
      // handler (skipping client-dir setup) when it's absent -- a
      // "vscode"-prefixed name takes its best-supported path.
      clientInfo: { name: "vscode-hdl-webide", version: "0.1.0" },
      workspaceFolders: [{ uri: rootUri, name: this.projectId }],
      capabilities: CLIENT_CAPABILITIES,
    });
    this.connection.sendNotification("initialized", {});

    // (Re-)announce every known document to the (possibly fresh, after a
    // reconnect) svlangserver process, then unblock queued work.
    for (const doc of this.documents.values()) {
      doc.opened = false;
      this.ensureOpened(doc);
    }
    this.resolveReady();

    // The server's own indexing pass may have run before the workspace was
    // seeded on disk (svlangserver processes outlive page reloads, and they
    // never re-index on their own) -- always rebuild once we're connected.
    void this.rebuildIndex();
  }

  /** Asks svlangserver to re-glob the workspace and rebuild its symbol
   * index -- required after files appear/disappear on disk, since the
   * server has no file watcher. Safe to call repeatedly; the server skips
   * the rebuild when the file set is unchanged. */
  async rebuildIndex(): Promise<void> {
    await this.ready;
    if (!this.connection) return;
    try {
      await this.connection.sendRequest("workspace/executeCommand", { command: "systemverilog.build_index" });
    } catch {
      // server busy or briefly disconnected -- the next trigger retries
    }
  }

  // -- document lifecycle (called by useLspClient) -------------------------

  openDocument(monacoUriString: string, relativePath: string, languageId: string, text: string): void {
    const doc: OpenDocument = { monacoUriString, relativePath, languageId, version: 1, opened: false, initialText: text };
    this.documents.set(monacoUriString, doc);
    void this.ready.then(() => this.ensureOpened(doc));
  }

  /** Sends didOpen exactly once per (re)connection for this document --
   * called both from `openDocument` (via the ready gate) and from
   * `initialize` (re-announce after reconnect). Requires `rootPath`, so it
   * must only run after `initialize` fetched it. */
  private ensureOpened(doc: OpenDocument): void {
    if (doc.opened || !this.connection) return;
    doc.lspUri = this.lspUriFor(doc.relativePath);
    this.lspUriToMonacoUri.set(doc.lspUri, doc.monacoUriString);
    const model = this.monaco.editor.getModel(this.monaco.Uri.parse(doc.monacoUriString));
    const text = model ? model.getValue() : doc.initialText;
    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri: doc.lspUri, languageId: doc.languageId, version: doc.version, text },
    });
    doc.opened = true;
  }

  updateDocument(monacoUriString: string, text: string): void {
    const doc = this.documents.get(monacoUriString);
    if (!doc) return;
    doc.version += 1;
    doc.initialText = text; // keep fresh so a reconnect re-announces current content
    void this.ready.then(() => {
      if (!doc.lspUri) return;
      this.connection?.sendNotification("textDocument/didChange", {
        textDocument: { uri: doc.lspUri, version: doc.version },
        contentChanges: [{ text }], // full-document sync -- simplest correct option
      });
    });
  }

  saveDocument(monacoUriString: string, text: string): void {
    const doc = this.documents.get(monacoUriString);
    if (!doc) return;
    void this.ready.then(() => {
      if (!doc.lspUri) return;
      this.connection?.sendNotification("textDocument/didSave", {
        textDocument: { uri: doc.lspUri },
        text,
      });
    });
  }

  closeDocument(monacoUriString: string): void {
    const doc = this.documents.get(monacoUriString);
    if (!doc) return;
    this.documents.delete(monacoUriString);
    void this.ready.then(() => {
      if (!doc.lspUri) return;
      this.lspUriToMonacoUri.delete(doc.lspUri);
      this.connection?.sendNotification("textDocument/didClose", { textDocument: { uri: doc.lspUri } });
    });
  }

  /** See `ensureModelForUri`'s doc. */
  setEnsureModelHook(fn: ((lspUri: string) => string | undefined) | null): void {
    this.ensureModelForUri = fn;
  }

  /** See `textSearchHook`'s doc. */
  setTextSearchHook(fn: ((word: string) => languages.Location[]) | null): void {
    this.textSearchHook = fn;
  }

  /** Resolves `lspUri` to a Monaco URI string, pre-creating a model for it
   * via `ensureModelForUri` (and remembering the mapping) if it isn't
   * already an open document. */
  private ensureMonacoUriFor(lspUri: string): string | undefined {
    const existing = this.lspUriToMonacoUri.get(lspUri);
    if (existing) return existing;
    const ensured = this.ensureModelForUri?.(lspUri);
    if (ensured) this.lspUriToMonacoUri.set(lspUri, ensured);
    return ensured;
  }

  /** `workspace/symbol` has no Monaco provider slot (that's a VSCode-only
   * extension API) -- exposed directly for a future command-palette-style
   * "search symbols across project" UI to call. */
  async searchWorkspaceSymbols(query: string): Promise<LspSymbolInformation[]> {
    await this.ready;
    const result = await this.safeRequest<LspSymbolInformation[] | null>("workspace/symbol", { query }, null);
    return result ?? [];
  }

  private applyDiagnostics(params: LspPublishDiagnosticsParams): void {
    const monacoUriString = this.lspUriToMonacoUri.get(params.uri);
    if (!monacoUriString) return;
    const model = this.monaco.editor.getModel(this.monaco.Uri.parse(monacoUriString));
    if (!model) return;
    const markers: MonacoEditorNS.IMarkerData[] = params.diagnostics.map((d: LspDiagnostic) => ({
      ...toMonacoRange(d.range),
      severity: severityToMonaco(d.severity),
      message: d.message,
      source: d.source ?? "svlangserver",
      code: d.code !== undefined ? String(d.code) : undefined,
    }));
    this.monaco.editor.setModelMarkers(model, "svlangserver", markers);
  }

  private resolveLspUri(monacoUri: string): string | undefined {
    for (const [lspUri, uri] of this.lspUriToMonacoUri) if (uri === monacoUri) return lspUri;
    return undefined;
  }

  /** Only returns documents that have completed didOpen (so `lspUri` is
   * set) -- providers can then use `doc.lspUri` unconditionally. */
  private currentDocument(model: MonacoEditorNS.ITextModel): (OpenDocument & { lspUri: string }) | undefined {
    const doc = this.documents.get(model.uri.toString());
    return doc?.lspUri ? (doc as OpenDocument & { lspUri: string }) : undefined;
  }

  /** Every provider's request goes through here instead of calling
   * `connection.sendRequest` directly: svlangserver doesn't implement every
   * LSP method (confirmed via manual testing: `textDocument/references`
   * currently responds with JSON-RPC error -32601 "Unhandled method"), and
   * `sendRequest` rejects on any error response. Letting that rejection
   * propagate out of a Monaco provider callback becomes an unhandled
   * promise rejection at the page level instead of the graceful
   * "no results" a missing/failing method should degrade to. */
  private async safeRequest<T>(method: string, params: unknown, fallback: T): Promise<T> {
    if (!this.connection) return fallback;
    try {
      return await this.connection.sendRequest<T>(method, params);
    } catch {
      return fallback;
    }
  }

  // -- provider registration (once per connection instance) ----------------

  private registerProviders(): void {
    const { monaco } = this;
    const LANGUAGE_ID = "verilog";

    this.providerDisposables.push(
      monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        triggerCharacters: [".", "(", "[", "`"],
        provideCompletionItems: async (model: MonacoEditorNS.ITextModel, position: Position) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return { suggestions: [] };
          await this.ready;
          const list = await this.safeRequest<LspCompletionList | LspCompletionList["items"] | null>(
            "textDocument/completion",
            { textDocument: { uri: doc.lspUri }, position: toLspPosition(position) },
            null
          );
          const items = Array.isArray(list) ? list : (list?.items ?? []);
          const word = model.getWordUntilPosition(position);
          const defaultRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return { suggestions: items.map((item) => toMonacoCompletionItem(monaco.languages, item, defaultRange)) };
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerHoverProvider(LANGUAGE_ID, {
        provideHover: async (model: MonacoEditorNS.ITextModel, position: Position) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return null;
          await this.ready;
          const hover = await this.safeRequest<LspHover | null>(
            "textDocument/hover",
            { textDocument: { uri: doc.lspUri }, position: toLspPosition(position) },
            null
          );
          if (!hover) return null;
          return {
            contents: toMonacoHoverContents(hover.contents),
            range: hover.range ? toMonacoRange(hover.range) : undefined,
          };
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerSignatureHelpProvider(LANGUAGE_ID, {
        signatureHelpTriggerCharacters: ["(", ","],
        provideSignatureHelp: async (model: MonacoEditorNS.ITextModel, position: Position) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return null;
          await this.ready;
          const help = await this.safeRequest<LspSignatureHelp | null>(
            "textDocument/signatureHelp",
            { textDocument: { uri: doc.lspUri }, position: toLspPosition(position) },
            null
          );
          if (!help) return null;
          return { value: toMonacoSignatureHelp(help), dispose: () => undefined };
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerDefinitionProvider(LANGUAGE_ID, {
        provideDefinition: async (model: MonacoEditorNS.ITextModel, position: Position) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return null;
          await this.ready;
          const result = await this.safeRequest<LspLocation | LspLocation[] | null>(
            "textDocument/definition",
            { textDocument: { uri: doc.lspUri }, position: toLspPosition(position) },
            null
          );
          if (!result) return null;
          const locations = Array.isArray(result) ? result : [result];
          locations.forEach((loc) => this.ensureMonacoUriFor(loc.uri));
          return locations.map((loc) => toMonacoLocation(monaco, (u) => this.lspUriToMonacoUri.get(u), loc));
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerReferenceProvider(LANGUAGE_ID, {
        provideReferences: async (
          model: MonacoEditorNS.ITextModel,
          position: Position,
          context: languages.ReferenceContext
        ) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return [];
          await this.ready;
          const result = await this.safeRequest<LspLocation[] | null>(
            "textDocument/references",
            {
              textDocument: { uri: doc.lspUri },
              position: toLspPosition(position),
              context: { includeDeclaration: context.includeDeclaration },
            },
            null
          );
          if (result && result.length > 0) {
            result.forEach((loc) => this.ensureMonacoUriFor(loc.uri));
            return result.map((loc) => toMonacoLocation(monaco, (u) => this.lspUriToMonacoUri.get(u), loc));
          }
          // svlangserver has no real references support (confirmed via its
          // capabilities response and source -- see textSearchReferences.ts) --
          // `result` above is reliably null/empty for this server, so fall
          // back to a client-side whole-word text search rather than always
          // reporting zero references.
          const word = model.getWordAtPosition(position);
          return word ? (this.textSearchHook?.(word.word) ?? []) : [];
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerRenameProvider(LANGUAGE_ID, {
        provideRenameEdits: async (model: MonacoEditorNS.ITextModel, position: Position, newName: string) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return { edits: [] };
          await this.ready;
          const edit = await this.safeRequest<LspWorkspaceEdit | null>(
            "textDocument/rename",
            { textDocument: { uri: doc.lspUri }, position: toLspPosition(position), newName },
            null
          );
          const edits: languages.IWorkspaceTextEdit[] = [];
          for (const [uri, textEdits] of Object.entries(edit?.changes ?? {})) {
            this.ensureMonacoUriFor(uri);
            const resourceUri = monaco.Uri.parse(this.lspUriToMonacoUri.get(uri) ?? uri);
            for (const textEdit of textEdits) {
              edits.push({ resource: resourceUri, textEdit: { range: toMonacoRange(textEdit.range), text: textEdit.newText }, versionId: undefined });
            }
          }
          return { edits };
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
        provideDocumentFormattingEdits: async (
          model: MonacoEditorNS.ITextModel,
          options: languages.FormattingOptions
        ) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return [];
          await this.ready;
          const edits = await this.safeRequest<LspTextEdit[] | null>(
            "textDocument/formatting",
            { textDocument: { uri: doc.lspUri }, options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } },
            null
          );
          return edits ? toMonacoTextEdits(edits) : [];
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerDocumentRangeFormattingEditProvider(LANGUAGE_ID, {
        provideDocumentRangeFormattingEdits: async (
          model: MonacoEditorNS.ITextModel,
          range: IRange,
          options: languages.FormattingOptions
        ) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return [];
          await this.ready;
          const edits = await this.safeRequest<LspTextEdit[] | null>(
            "textDocument/rangeFormatting",
            {
              textDocument: { uri: doc.lspUri },
              range: toLspRange(range),
              options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
            },
            null
          );
          return edits ? toMonacoTextEdits(edits) : [];
        },
      })
    );

    this.providerDisposables.push(
      monaco.languages.registerDocumentSymbolProvider(LANGUAGE_ID, {
        provideDocumentSymbols: async (model: MonacoEditorNS.ITextModel) => {
          const doc = this.currentDocument(model);
          if (!doc || !this.connection) return [];
          await this.ready;
          const symbols = await this.safeRequest<LspDocumentSymbol[] | LspSymbolInformation[] | null>(
            "textDocument/documentSymbol",
            { textDocument: { uri: doc.lspUri } },
            null
          );
          if (!symbols) return [];
          // Hierarchical DocumentSymbol[] (has `range`) vs flat SymbolInformation[]
          // (has `location` instead) -- servers may return either.
          if (symbols.length > 0 && "range" in symbols[0]) {
            return (symbols as LspDocumentSymbol[]).map(toMonacoDocumentSymbol);
          }
          return (symbols as LspSymbolInformation[]).map((s) => ({
            name: s.name,
            detail: s.containerName ?? "",
            kind: Math.max(0, s.kind - 1),
            tags: [],
            range: toMonacoRange(s.location.range),
            selectionRange: toMonacoRange(s.location.range),
            children: [],
          }));
        },
      })
    );
  }

  private dispose(): void {
    this.closed = true;
    for (const d of this.providerDisposables) d.dispose();
    this.providerDisposables = [];
    this.connection?.dispose();
    this.connection = null;
    this.socket?.close();
    this.socket = null;
    connections.delete(this.projectId);
  }
}

const connections = new Map<string, ProjectLspConnection>();

/** One connection per project id, shared across every open tab/model.
 * Callers that want to keep the connection (and its svlangserver process)
 * alive must hold the returned instance and call `.release()` on unmount --
 * see `useLspClient`'s connection-lifecycle effect, the only caller that
 * should do so. Everything else should use `peekLspConnection` instead. */
export function acquireLspConnection(
  projectId: string,
  wsUrl: string,
  apiUrl: string,
  monaco: Monaco
): ProjectLspConnection {
  let connection = connections.get(projectId);
  if (!connection) {
    connection = new ProjectLspConnection(projectId, wsUrl, apiUrl, monaco);
    connections.set(projectId, connection);
  }
  connection.acquire();
  return connection;
}

/** Looks up an already-acquired connection without affecting its refcount --
 * for document-sync effects that piggyback on a lifecycle owned elsewhere. */
export function peekLspConnection(projectId: string): ProjectLspConnection | undefined {
  return connections.get(projectId);
}
