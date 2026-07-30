"use client";

import { useMemo, useState } from "react";
import { useVcdSignals } from "@/hooks/useVcdSignals";
import { useSimulationStore } from "@/store/simulationStore";
import { useWatchStore } from "@/store/watchStore";
import { buildVcdTree, type VcdTreeNode } from "@/services/waveform/vcdParser";
import { IconSearch } from "@/components/Explorer/icons";
import { IconChevronRight } from "@/components/icons";

/** Signal Objects panel: a tree view of the active run's VCD hierarchy
 * (built by `buildVcdTree` from the same parsed signal list `WatchPanel`
 * uses via `useVcdSignals` -- one fetch/parse, two panels). Clicking a
 * signal focuses it in the Waveform panel (via `simulationStore.focusSignal`,
 * see that store's doc); double-click adds it to the Watch panel. */
export default function ObjectsPanel() {
  const { signals, loading } = useVcdSignals();
  const focusSignal = useSimulationStore((s) => s.focusSignal);
  const addToWatch = useWatchStore((s) => s.add);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const tree = useMemo(() => buildVcdTree(signals), [signals]);

  const filteredTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    const filterNode = (node: VcdTreeNode): VcdTreeNode | null => {
      const children = node.children.map(filterNode).filter((c): c is VcdTreeNode => !!c);
      const selfMatches = node.name.toLowerCase().includes(q);
      if (!selfMatches && children.length === 0) return null;
      return { ...node, children };
    };
    return tree.map(filterNode).filter((n): n is VcdTreeNode => !!n);
  }, [tree, query]);

  const toggleCollapsed = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: VcdTreeNode, depth: number): React.ReactNode => {
    const isLeaf = node.children.length === 0;
    const isCollapsed = collapsed.has(node.path) && !query.trim();

    return (
      <div key={node.path}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => (isLeaf ? focusSignal(node.path) : toggleCollapsed(node.path))}
          onDoubleClick={() => isLeaf && addToWatch(node.path, node.name)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (isLeaf) focusSignal(node.path);
              else toggleCollapsed(node.path);
            }
          }}
          title={isLeaf ? `${node.path} -- click to view in waveform, double-click to watch` : node.path}
          style={{ paddingLeft: 8 + depth * 16 }}
          className="flex w-full cursor-default items-center gap-1.5 py-1 pr-3 text-[12.5px] text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2"
        >
          {!isLeaf && (
            <IconChevronRight className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${!isCollapsed ? "rotate-90" : ""}`} />
          )}
          <span className={`truncate ${isLeaf ? "text-text-primary" : "font-medium"}`}>{node.name}</span>
          {isLeaf && node.signal && (
            <span className="shrink-0 text-[10px] text-text-muted">
              {node.signal.type}
              {node.signal.width > 1 ? `[${node.signal.width - 1}:0]` : ""}
            </span>
          )}
        </div>
        {!isLeaf && !isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-terminal-bg">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-panel-border px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-panel-border bg-surface-1 px-2 py-1">
          <IconSearch className="h-3 w-3 shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter objects…"
            aria-label="Filter objects"
            className="w-full min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">Loading signals…</div>
        ) : filteredTree.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
            {signals.length === 0 ? "Run a simulation to browse its signal hierarchy here." : `No objects match "${query}".`}
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  );
}
