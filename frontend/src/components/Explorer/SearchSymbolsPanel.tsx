"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import { buildWorkspaceSymbolIndex, type SymbolKind, type WorkspaceSymbol } from "@/services/analysis/workspaceSymbolIndex";
import { fuzzyMatch, type FuzzyMatch } from "@/services/search/fuzzyMatch";
import { editorManager } from "@/services/editor/EditorManager";
import { IconSearch } from "./icons";

const KIND_GLYPH: Record<SymbolKind, string> = {
  module: "M",
  entity: "E",
  architecture: "A",
  function: "F",
  task: "T",
  process: "P",
  always: "@",
  signal: "S",
};

function HighlightedText({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, start)}</span>);
    parts.push(
      <mark key={`m${i}`} className="rounded-sm bg-accent/25 text-inherit">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

/** Real "Search Symbols" sidebar panel -- fuzzy search over every module,
 * entity, architecture, function, task, process, and signal/port in the
 * workspace, backed by `workspaceSymbolIndex.ts` (built on the same
 * `hdlOutline` parser the sticky header/cursor inspector use). The Search
 * Everywhere palette's symbols section (Ctrl+P) reuses this exact index and
 * this exact fuzzy matcher -- see that component's doc. */
export default function SearchSymbolsPanel() {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const openExplorerFile = useExplorerStore((s) => s.openFile);
  const openEditorTab = useEditorStore((s) => s.openFile);
  const [query, setQuery] = useState("");

  const index = useMemo(() => buildWorkspaceSymbolIndex(nodes, rootId), [nodes, rootId]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const scored: { symbol: WorkspaceSymbol; match: FuzzyMatch }[] = [];
    for (const symbol of index) {
      const match = fuzzyMatch(query, symbol.name);
      if (match) scored.push({ symbol, match });
    }
    scored.sort((a, b) => b.match.score - a.match.score);
    return scored.slice(0, 200);
  }, [index, query]);

  const openSymbol = (symbol: WorkspaceSymbol) => {
    const node = nodes[symbol.fileId];
    if (!node || node.kind !== "file") return;
    openExplorerFile(symbol.fileId);
    openEditorTab(symbol.fileId);
    const opened = editorManager.revealLocation(symbol.fileId, { lineNumber: symbol.line, column: 1 });
    if (opened) editorManager.flashLine(symbol.fileId, symbol.line);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center px-4 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Search
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-panel-border bg-surface-1 px-2 py-1.5 focus-within:border-accent">
          <IconSearch className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules, signals, functions…"
            aria-label="Search symbols"
            className="w-full min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-1 pb-2">
        {query.trim() === "" ? (
          <p className="px-3 py-4 text-center text-xs leading-relaxed text-text-muted">
            Search modules, entities, architectures, functions, tasks, processes, and signals across the whole
            workspace.
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-text-muted">No symbols match &quot;{query}&quot;.</p>
        ) : (
          <ul>
            {results.map(({ symbol, match }) => (
              <li key={symbol.id}>
                <button
                  type="button"
                  onClick={() => openSymbol(symbol)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-surface-hover"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-surface-hover text-[10px] font-semibold text-accent">
                    {KIND_GLYPH[symbol.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-primary">
                      <HighlightedText text={symbol.name} ranges={match.ranges} />
                    </span>
                    <span className="block truncate text-[10px] text-text-muted">
                      {symbol.relativePath}:{symbol.line}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
