import type { TreeNode, FolderNodeData } from "@/types/explorer";
import { buildHdlOutline, type OutlineKind } from "./hdlOutline";
import { getMonacoLanguage } from "@/services/editor/languageMapping";
import { extname } from "@/utils/format";

export type SymbolKind = OutlineKind | "signal";

export interface WorkspaceSymbol {
  id: string;
  kind: SymbolKind;
  name: string;
  detail?: string;
  fileId: string;
  relativePath: string;
  line: number;
}

const HDL_EXTENSIONS = new Set(["v", "sv", "svh", "vh", "vhd", "vhdl"]);
const MAX_SIGNALS_PER_FILE = 500;

const VERILOG_SIGNAL_DECL =
  /\b(input|output|inout|wire|reg|logic)\b\s+(?:signed|unsigned\s+)?(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)/g;
const VHDL_SIGNAL_DECL = /\bsignal\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*:/gi;

/** Best-effort signal/port name extraction -- deliberately simpler than
 * `hdlOutline.ts`'s block tracking (no nesting/ranges to worry about, just
 * "what's declared on this line"). Same heuristic-scan philosophy as
 * `hdlParser.ts`: handles the common single-declaration-per-line style; may
 * miss unusual layouts. */
function extractSignalNames(content: string, language: string): { name: string; line: number }[] {
  const lines = content.split(/\r\n|\r|\n/);
  const decl = language === "vhdl" ? VHDL_SIGNAL_DECL : VERILOG_SIGNAL_DECL;
  const out: { name: string; line: number }[] = [];

  for (let i = 0; i < lines.length && out.length < MAX_SIGNALS_PER_FILE; i += 1) {
    const raw = lines[i];
    const line = language === "vhdl" ? raw.replace(/--.*$/, "") : raw.replace(/\/\/.*$/, "");
    decl.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = decl.exec(line))) {
      const namesGroup = language === "vhdl" ? match[1] : match[2];
      if (!namesGroup) continue;
      for (const name of namesGroup.split(",")) {
        const trimmed = name.trim();
        if (trimmed) out.push({ name: trimmed, line: i + 1 });
      }
    }
  }
  return out;
}

/** Project-wide symbol index for Search Symbols / Search Everywhere. Reuses
 * the exact same `buildHdlOutline` parse the sticky header/cursor inspector
 * use for whichever file is open, just run across every HDL file in the
 * tree -- so structural symbols (modules/entities/functions/tasks/processes)
 * are never parsed twice by two different features.
 *
 * Deliberately NOT kept live/incremental: callers (`SearchSymbolsPanel`,
 * `CommandPalette`) rebuild this via `useMemo` keyed on the explorer's
 * `nodes`, so the cost is only ever paid while one of those UIs is actually
 * open -- not on every keystroke while editing with both closed. */
export function buildWorkspaceSymbolIndex(nodes: Record<string, TreeNode>, rootId: string): WorkspaceSymbol[] {
  const root = nodes[rootId] as FolderNodeData | undefined;
  if (!root) return [];
  const out: WorkspaceSymbol[] = [];

  const walk = (id: string, prefix: string) => {
    const node = nodes[id];
    if (!node) return;
    if (node.kind === "folder") {
      node.children.forEach((cid) => walk(cid, `${prefix}${node.name}/`));
      return;
    }
    const ext = extname(node.name);
    if (!HDL_EXTENSIONS.has(ext)) return;
    const relativePath = `${prefix}${node.name}`;
    const language = getMonacoLanguage(ext);
    const content = node.content ?? "";

    for (const symbol of buildHdlOutline(content, language)) {
      if (symbol.kind === "always") continue; // not a meaningfully-named/searchable symbol
      out.push({
        id: `${id}:${symbol.id}`,
        kind: symbol.kind,
        name: symbol.name,
        detail: symbol.detail,
        fileId: id,
        relativePath,
        line: symbol.startLine,
      });
    }

    for (const { name, line } of extractSignalNames(content, language)) {
      out.push({ id: `${id}:signal:${line}:${name}`, kind: "signal", fileId: id, relativePath, name, line });
    }
  };

  root.children.forEach((cid) => walk(cid, ""));
  return out;
}
