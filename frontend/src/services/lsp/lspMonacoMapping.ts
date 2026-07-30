/** LSP <-> Monaco shape/enum translation. Kept isolated from `lspConnection.ts`
 * so the wire-format details (0- vs 1-based positions, differently-ordered
 * enums) don't leak into the connection/provider-registration logic. */

import type { editor, IRange, languages } from "monaco-editor";
import type {
  LspCompletionItem,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspMarkedString,
  LspMarkupContent,
  LspPosition,
  LspRange,
  LspSignatureHelp,
  LspTextEdit,
} from "./lspTypes";

export function toLspPosition(position: { lineNumber: number; column: number }): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

export function toLspRange(range: IRange): LspRange {
  return {
    start: toLspPosition({ lineNumber: range.startLineNumber, column: range.startColumn }),
    end: toLspPosition({ lineNumber: range.endLineNumber, column: range.endColumn }),
  };
}

export function toMonacoRange(range: LspRange): IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function isMarkupContent(value: unknown): value is LspMarkupContent {
  return typeof value === "object" && value !== null && "kind" in value && "value" in value;
}

function markedStringToText(value: LspMarkedString): string {
  return typeof value === "string" ? value : `\`\`\`${value.language}\n${value.value}\n\`\`\``;
}

/** Normalizes any of Hover.contents' three possible shapes into Monaco's
 * `IMarkdownString[]`. */
export function toMonacoHoverContents(contents: LspHover["contents"]): { value: string }[] {
  if (isMarkupContent(contents)) return [{ value: contents.value }];
  if (Array.isArray(contents)) return contents.map((c) => ({ value: markedStringToText(c) }));
  return [{ value: markedStringToText(contents) }];
}

export function toMonacoDocumentation(doc: string | LspMarkupContent | undefined): string | { value: string } | undefined {
  if (doc === undefined) return undefined;
  return isMarkupContent(doc) ? { value: doc.value } : doc;
}

// LSP CompletionItemKind (1-25) -> Monaco languages.CompletionItemKind name.
// The two enums use different numeric orderings, so this must be an explicit
// table, not an offset.
const COMPLETION_KIND_NAMES: Record<number, keyof typeof import("monaco-editor").languages.CompletionItemKind> = {
  1: "Text",
  2: "Method",
  3: "Function",
  4: "Constructor",
  5: "Field",
  6: "Variable",
  7: "Class",
  8: "Interface",
  9: "Module",
  10: "Property",
  11: "Unit",
  12: "Value",
  13: "Enum",
  14: "Keyword",
  15: "Snippet",
  16: "Color",
  17: "File",
  18: "Reference",
  19: "Folder",
  20: "EnumMember",
  21: "Constant",
  22: "Struct",
  23: "Event",
  24: "Operator",
  25: "TypeParameter",
};

export function toMonacoCompletionItemKind(
  monacoLanguages: typeof languages,
  lspKind: number | undefined
): languages.CompletionItemKind {
  const name = lspKind !== undefined ? COMPLETION_KIND_NAMES[lspKind] : undefined;
  return monacoLanguages.CompletionItemKind[name ?? "Text"];
}

/** LSP SymbolKind (1-26) and Monaco's `languages.SymbolKind` (0-25) use the
 * *same* ordering, just 1- vs 0-based -- a plain offset is correct here
 * (unlike CompletionItemKind above). */
export function toMonacoSymbolKind(lspKind: number): number {
  return Math.max(0, lspKind - 1);
}

export function toMonacoCompletionItem(
  monacoLanguages: typeof languages,
  item: LspCompletionItem,
  defaultRange: IRange
): languages.CompletionItem {
  const range = item.textEdit ? toMonacoRange(item.textEdit.range) : defaultRange;
  return {
    label: item.label,
    kind: toMonacoCompletionItemKind(monacoLanguages, item.kind),
    detail: item.detail,
    documentation: toMonacoDocumentation(item.documentation),
    insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
    sortText: item.sortText,
    filterText: item.filterText,
    commitCharacters: item.commitCharacters,
    tags: item.deprecated ? [1 /* languages.CompletionItemTag.Deprecated */] : undefined,
    range,
  };
}

export function toMonacoSignatureHelp(help: LspSignatureHelp): languages.SignatureHelp {
  return {
    signatures: help.signatures.map((sig) => ({
      label: sig.label,
      documentation: toMonacoDocumentation(sig.documentation),
      parameters: (sig.parameters ?? []).map((p) => ({
        label: p.label,
        documentation: toMonacoDocumentation(p.documentation),
      })),
      activeParameter: sig.activeParameter,
    })),
    activeSignature: help.activeSignature ?? 0,
    activeParameter: help.activeParameter ?? 0,
  };
}

/** `resolveUri` maps an LSP `file://` document URI back to a Monaco model
 * URI -- see `lspConnection.ts`'s document registry. Falls back to parsing
 * the LSP URI directly (won't resolve to an open model, but keeps the
 * shape valid) when the target file isn't open in this session. */
export function toMonacoLocation(
  monaco: { Uri: { parse(value: string): editor.IModel["uri"] } },
  resolveUri: (lspUri: string) => string | undefined,
  location: LspLocation
): languages.Location {
  const monacoUriString = resolveUri(location.uri) ?? location.uri;
  return { uri: monaco.Uri.parse(monacoUriString), range: toMonacoRange(location.range) };
}

export function toMonacoTextEdits(edits: LspTextEdit[]): languages.TextEdit[] {
  return edits.map((e) => ({ range: toMonacoRange(e.range), text: e.newText }));
}

export function toMonacoDocumentSymbol(symbol: LspDocumentSymbol): languages.DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail ?? "",
    kind: toMonacoSymbolKind(symbol.kind),
    tags: [],
    range: toMonacoRange(symbol.range),
    selectionRange: toMonacoRange(symbol.selectionRange),
    children: (symbol.children ?? []).map(toMonacoDocumentSymbol),
  };
}
