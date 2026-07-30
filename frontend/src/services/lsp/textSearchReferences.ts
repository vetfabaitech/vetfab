/** Client-side fallback for Find All References.
 *
 * Confirmed (by inspecting the running svlangserver 0.4.1 container
 * directly, both its `initialize` response and its source) that this
 * server has no reference-search capability whatsoever: its capabilities
 * object never sets `referencesProvider`, and there is no
 * `connection.onReferences` handler anywhere in the package -- unlike
 * `textDocument/definition`/`hover`/`completion`/formatting, which are all
 * genuinely implemented and confirmed working. `textDocument/references`
 * always fails with JSON-RPC "Unhandled method", not a transient error.
 *
 * Rather than Find All References permanently returning nothing, this does
 * a whole-word text scan across every HDL file already held in memory in
 * the explorer tree. It's not semantically precise -- no scoping/shadowing
 * awareness, so a signal named the same in two unrelated modules both show
 * up -- but real, navigable (if occasionally over-broad) results beat an
 * always-empty command. This is informational only (the user picks which
 * results are relevant); it is deliberately NOT used for rename, where
 * over-broad text matches would silently corrupt unrelated code.
 */

import type { TreeNode } from "@/types/explorer";
import { flattenWorkspaceFiles } from "./workspacePaths";

const HDL_EXTENSION_RE = /\.(v|sv|svh|vh)$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface TextSearchMatch {
  /** Workspace-relative path, e.g. "rtl/top.v". */
  path: string;
  line: number; // 0-based
  startColumn: number; // 0-based
  endColumn: number; // 0-based
}

/** Whole-word (`\b`-bounded) matches for `word` across every HDL file in
 * the current tree. Case-sensitive, matching Verilog/SystemVerilog
 * identifier semantics. */
export function searchWholeWordReferences(
  word: string,
  nodes: Record<string, TreeNode>,
  rootId: string
): TextSearchMatch[] {
  if (!word) return [];
  const files = flattenWorkspaceFiles(nodes, rootId).filter((f) => HDL_EXTENSION_RE.test(f.path));
  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "g");
  const matches: TextSearchMatch[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let line = 0; line < lines.length; line++) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lines[line])) !== null) {
        matches.push({ path: file.path, line, startColumn: m.index, endColumn: m.index + word.length });
        if (m.index === pattern.lastIndex) pattern.lastIndex++; // guard against zero-width loops
      }
    }
  }
  return matches;
}
