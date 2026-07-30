"use client";

import { useMemo, useState } from "react";
import type { ProblemEntry, ProblemSeverity } from "@/types/diagnostics";
import { IconChevronRight } from "@/components/icons";
import { IconSearch } from "@/components/Explorer/icons";
import FileIcon from "@/components/Explorer/FileIcon";
import ProblemItem from "./ProblemItem";

const SEVERITIES: ProblemSeverity[] = ["error", "warning", "info"];
const SEVERITY_LABEL: Record<ProblemSeverity, string> = { error: "Errors", warning: "Warnings", info: "Info" };

interface FileGroup {
  filePath: string;
  fileName: string;
  entries: ProblemEntry[];
}

function groupByFile(problems: ProblemEntry[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const entry of problems) {
    const existing = groups.get(entry.filePath);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(entry.filePath, { filePath: entry.filePath, fileName: entry.fileName, entries: [entry] });
    }
  }
  return Array.from(groups.values());
}

interface ProblemsPanelProps {
  problems: ProblemEntry[];
  onSelect: (entry: ProblemEntry) => void;
}

/** VS Code-style Problems list: diagnostics grouped by file (collapsible),
 * each row navigating the editor on click/Enter. Reads Monaco's marker
 * table via `useProblems.ts` -- see that hook's doc for why there's no
 * separate diagnostics store backing this. */
export default function ProblemsPanel({ problems, onSelect }: ProblemsPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [activeSeverities, setActiveSeverities] = useState<Set<ProblemSeverity>>(() => new Set(SEVERITIES));

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const warningCount = problems.filter((p) => p.severity === "warning").length;
  const infoCount = problems.filter((p) => p.severity === "info").length;
  const countBySeverity: Record<ProblemSeverity, number> = { error: errorCount, warning: warningCount, info: infoCount };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems.filter(
      (p) =>
        activeSeverities.has(p.severity) &&
        (!q || p.message.toLowerCase().includes(q) || p.fileName.toLowerCase().includes(q))
    );
  }, [problems, query, activeSeverities]);

  const groups = useMemo(() => groupByFile(filtered), [filtered]);

  const toggleGroup = (filePath: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSeverity = (severity: ProblemSeverity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-terminal-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-panel-border px-3 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-panel-border bg-surface-1 px-2 py-1">
          <IconSearch className="h-3 w-3 shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter problems…"
            aria-label="Filter problems"
            className="w-full min-w-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {SEVERITIES.map((severity) => (
            <button
              key={severity}
              type="button"
              onClick={() => toggleSeverity(severity)}
              aria-pressed={activeSeverities.has(severity)}
              title={`${activeSeverities.has(severity) ? "Hide" : "Show"} ${SEVERITY_LABEL[severity].toLowerCase()}`}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-200 ${
                activeSeverities.has(severity)
                  ? "bg-surface-hover text-text-primary"
                  : "text-text-muted hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              {SEVERITY_LABEL[severity]} ({countBySeverity[severity]})
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto py-1">
        {problems.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No problems detected.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            No problems match the current filter.
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.filePath);
            return (
              <div key={group.filePath}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.filePath)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleGroup(group.filePath);
                    }
                  }}
                  className="flex w-full cursor-default items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-text-secondary outline-none transition-colors duration-200 hover:bg-surface-2 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
                >
                  <IconChevronRight
                    className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${!isCollapsed ? "rotate-90" : ""}`}
                  />
                  <FileIcon name={group.fileName} kind="file" iconSize="small" />
                  <span className="truncate">{group.fileName}</span>
                  <span className="shrink-0 text-text-muted">{group.entries.length}</span>
                  <span className="min-w-0 flex-1 truncate text-text-muted">{group.filePath}</span>
                </div>
                {!isCollapsed &&
                  group.entries.map((entry) => (
                    <ProblemItem key={entry.id} entry={entry} onSelect={onSelect} />
                  ))}
              </div>
            );
          })
        )}
      </div>

      {problems.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-panel-border bg-surface-sunken px-3 py-1 text-[11px]">
          {errorCount > 0 && <span className="text-error">Errors ({errorCount})</span>}
          {warningCount > 0 && <span className="text-warning">Warnings ({warningCount})</span>}
        </div>
      )}
    </div>
  );
}
