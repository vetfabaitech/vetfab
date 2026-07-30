"use client";

import { useMemo, useRef, useState } from "react";
import { useWatchStore } from "@/store/watchStore";
import { useSimulationStore } from "@/store/simulationStore";
import { useVcdSignals } from "@/hooks/useVcdSignals";
import { fuzzyMatch } from "@/services/search/fuzzyMatch";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { IconPin, IconSearch } from "@/components/Explorer/icons";
import { IconClose, IconPlus } from "@/components/icons";

/** Visual Studio-style Watch window: add/remove/pin/search signals from the
 * active simulation session's completed VCD, showing type/width/hierarchy
 * plus the initial-dump value from `useVcdSignals`/`vcdParser.ts` (see that
 * hook's doc for why this is a snapshot, not a live-updating value -- the
 * execution pipeline is a batch run, not an interactive session streaming
 * value changes). Editing values is future work, gated on a simulator that
 * can accept writes at all. */
export default function WatchPanel() {
  const watched = useWatchStore((s) => s.signals);
  const addSignal = useWatchStore((s) => s.add);
  const removeSignal = useWatchStore((s) => s.remove);
  const togglePin = useWatchStore((s) => s.togglePin);
  const { signals, loading } = useVcdSignals();
  const focusSignal = useSimulationStore((s) => s.focusSignal);

  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const addBoxRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(addBoxRef, () => setAddOpen(false));

  const byPath = useMemo(() => new Map(signals.map((s) => [s.hierarchyPath, s])), [signals]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return watched
      .filter((w) => !q || w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [watched, query]);

  const addSuggestions = useMemo(() => {
    if (!addQuery.trim()) return [];
    const watchedPaths = new Set(watched.map((w) => w.path));
    return signals
      .filter((s) => !watchedPaths.has(s.hierarchyPath))
      .map((s) => ({ signal: s, match: fuzzyMatch(addQuery, s.name) }))
      .filter((r): r is { signal: (typeof signals)[number]; match: NonNullable<typeof r.match> } => r.match !== null)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 30);
  }, [signals, addQuery, watched]);

  return (
    <div className="flex h-full flex-col bg-terminal-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-panel-border px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-panel-border bg-surface-1 px-2 py-1">
          <IconSearch className="h-3 w-3 shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter watched signals…"
            aria-label="Filter watched signals"
            className="w-full min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <div ref={addBoxRef} className="relative shrink-0">
          <div className="flex items-center gap-1.5 rounded-md border border-panel-border bg-surface-1 px-2 py-1">
            <IconPlus className="h-3 w-3 shrink-0 text-text-muted" />
            <input
              value={addQuery}
              onChange={(e) => {
                setAddQuery(e.target.value);
                setAddOpen(true);
              }}
              onFocus={() => setAddOpen(true)}
              placeholder={loading ? "Loading signals…" : "Add signal…"}
              aria-label="Add signal to watch"
              disabled={signals.length === 0}
              className="w-36 min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
            />
          </div>
          {addOpen && addSuggestions.length > 0 && (
            <div className="scrollbar-thin absolute right-0 top-full z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-panel-border bg-surface-1 py-1 shadow-elevated">
              {addSuggestions.map(({ signal }) => (
                <button
                  key={signal.hierarchyPath}
                  type="button"
                  onClick={() => {
                    addSignal(signal.hierarchyPath, signal.name);
                    setAddQuery("");
                    setAddOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-surface-hover"
                >
                  <span className="text-text-primary">{signal.name}</span>
                  <span className="truncate text-[10px] text-text-muted">{signal.hierarchyPath}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
            {signals.length === 0
              ? "Run a simulation, then add signals from its waveform to watch them here."
              : "No watched signals yet -- use “Add signal…” above."}
          </div>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="sticky top-0 bg-surface-sunken text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                <th className="px-3 py-1.5 font-semibold">Name</th>
                <th className="px-2 py-1.5 font-semibold">Value</th>
                <th className="px-2 py-1.5 font-semibold">Type</th>
                <th className="px-2 py-1.5 font-semibold">Width</th>
                <th className="px-2 py-1.5 font-semibold">Hierarchy</th>
                <th className="w-16 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const resolved = byPath.get(w.path);
                return (
                  <tr
                    key={w.id}
                    onClick={() => focusSignal(w.path)}
                    className="cursor-default border-b border-panel-border/60 transition-colors duration-150 hover:bg-surface-2"
                  >
                    <td className="px-3 py-1.5 font-medium text-text-primary">{w.name}</td>
                    <td className="px-2 py-1.5 font-mono text-text-secondary">{resolved?.initialValue ?? "—"}</td>
                    <td className="px-2 py-1.5 text-text-muted">{resolved?.type ?? "—"}</td>
                    <td className="px-2 py-1.5 text-text-muted">{resolved?.width ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-2 py-1.5 text-text-muted">{w.path}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin(w.id);
                          }}
                          aria-pressed={w.pinned}
                          aria-label={w.pinned ? "Unpin signal" : "Pin signal"}
                          title={w.pinned ? "Unpin signal" : "Pin signal"}
                          className={`rounded p-1 transition-colors ${w.pinned ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
                        >
                          <IconPin className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSignal(w.id);
                          }}
                          aria-label="Remove from watch"
                          title="Remove from watch"
                          className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                        >
                          <IconClose className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
