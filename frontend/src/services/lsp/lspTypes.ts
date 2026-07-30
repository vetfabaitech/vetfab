/** Minimal LSP wire-format types -- only the fields this client actually
 * reads or writes. Avoids pulling in `vscode-languageserver-protocol` (a
 * much larger package) just for typings; the shapes below are the stable,
 * versioned parts of the LSP spec (https://microsoft.github.io/language-server-protocol/). */

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspMarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

export type LspMarkedString = string | { language: string; value: string };

export interface LspHover {
  contents: LspMarkupContent | LspMarkedString | LspMarkedString[];
  range?: LspRange;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LspMarkupContent;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  textEdit?: LspTextEdit;
  commitCharacters?: string[];
  deprecated?: boolean;
}

export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

export interface LspParameterInformation {
  label: string | [number, number];
  documentation?: string | LspMarkupContent;
}

export interface LspSignatureInformation {
  label: string;
  documentation?: string | LspMarkupContent;
  parameters?: LspParameterInformation[];
  activeParameter?: number;
}

export interface LspSignatureHelp {
  signatures: LspSignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
}

export interface LspDocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

export interface LspSymbolInformation {
  name: string;
  kind: number;
  location: LspLocation;
  containerName?: string;
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: number; // 1=Error 2=Warning 3=Info 4=Hint
  code?: string | number;
  source?: string;
  message: string;
}

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}
