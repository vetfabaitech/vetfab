"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "@/lib/types";
import { IconTrash, IconDownload } from "@/components/icons";
import { IconCopy, IconSearch } from "@/components/Explorer/icons";

const LEVEL_CLASSES: Record<LogEntry["level"], string> = {
  info: "text-text-secondary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** Collapses consecutive identical (same text + level) entries into one row
 * with a "xN" repeat badge -- VS Code's terminal/output panes do the same
 * for noisy repeated messages. Only merges adjacent runs, not
 * non-consecutive duplicates, so ordering/context is never lost. */
function collapseConsecutive(entries: LogEntry[]): { entry: LogEntry; count: number }[] {
  const out: { entry: LogEntry; count: number }[] = [];
  for (const entry of entries) {
    const last = out[out.length - 1];
    if (last && last.entry.text === entry.text && last.entry.level === entry.level) {
      last.count += 1;
    } else {
      out.push({ entry, count: 1 });
    }
  }
  return out;
}

interface LogListProps {
  entries: LogEntry[];
  onClear?: () => void;
  /** Filename (without extension logic needed -- pass the full name) that
   * enables the Download button; omit to hide it entirely. */
  downloadFilename?: string;
  showTimestamps?: boolean;
  showSearch?: boolean;
  collapseRepeats?: boolean;
  emptyMessage?: string;
}

/** Shared log/output renderer behind the Simulation Log panel, the
 * Compiler Output tab, and the right panel's Output pane -- search, copy,
 * download, pause-auto-scroll, level color-coding, and repeat-collapsing all
 * live here exactly once instead of being hand-rolled per surface (the
 * previous state of this codebase: `LogPanel.tsx` and `Terminal.tsx` each
 * had their own near-identical `LEVEL_CLASSES`/scroll-to-bottom copy). */
export default function LogList({
  entries,
  onClear,
  downloadFilename,
  showTimestamps = false,
  showSearch = false,
  collapseRepeats = true,
  emptyMessage = "No output yet.",
}: LogListProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.text.toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  const rows = useMemo(() => (collapseRepeats ? collapseConsecutive(filtered) : filtered.map((entry) => ({ entry, count: 1 }))), [filtered, collapseRepeats]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows, autoScroll]);

  const handleCopy = () => {
    const text = filtered.map((e) => e.text).join("\n");
    navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const handleDownload = () => {
    if (!downloadFilename) return;
    const text = filtered.map((e) => (showTimestamps && e.timestamp ? `[${formatTimestamp(e.timestamp)}] ${e.text}` : e.text)).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-panel-border px-3 py-1.5">
        {showSearch && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-panel-border bg-surface-1 px-2 py-1">
            <IconSearch className="h-3 w-3 shrink-0 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              aria-label="Filter log"
              className="w-full min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoScroll((v) => !v)}
            aria-pressed={autoScroll}
            title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-200 ${
              autoScroll ? "bg-surface-hover text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            Auto-scroll
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy output"
            title="Copy output"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
          >
            <IconCopy className="h-3.5 w-3.5" />
          </button>
          {downloadFilename && (
            <button
              type="button"
              onClick={handleDownload}
              aria-label="Download log"
              title="Download log"
              className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
            >
              <IconDownload className="h-3.5 w-3.5" />
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear"
              title="Clear"
              className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {rows.length === 0 ? (
          <div className="text-text-muted">{query ? `No output matches "${query}".` : emptyMessage}</div>
        ) : (
          rows.map(({ entry, count }) => (
            <div key={entry.id} className={`flex items-start gap-2 whitespace-pre-wrap break-words ${LEVEL_CLASSES[entry.level]}`}>
              {showTimestamps && entry.timestamp && (
                <span className="shrink-0 text-text-muted">{formatTimestamp(entry.timestamp)}</span>
              )}
              <span className="min-w-0 flex-1">{entry.text}</span>
              {count > 1 && (
                <span className="shrink-0 rounded-full bg-surface-hover px-1.5 text-[10px] text-text-muted">×{count}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
