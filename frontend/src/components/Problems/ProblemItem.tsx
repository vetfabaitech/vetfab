"use client";

import { KeyboardEvent } from "react";
import type { ProblemEntry } from "@/types/diagnostics";

const SEVERITY_GLYPH: Record<ProblemEntry["severity"], string> = {
  error: "✖", // ✖
  warning: "⚠", // ⚠
  info: "ⓘ", // ⓘ
};

const SEVERITY_CLASS: Record<ProblemEntry["severity"], string> = {
  error: "text-error",
  warning: "text-warning",
  info: "text-accent",
};

interface ProblemItemProps {
  entry: ProblemEntry;
  onSelect: (entry: ProblemEntry) => void;
}

export default function ProblemItem({ entry, onSelect }: ProblemItemProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(entry);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={handleKeyDown}
      aria-label={`${entry.severity}: ${entry.message}, ${entry.fileName}, line ${entry.line}, column ${entry.column}`}
      title={entry.message}
      className="flex w-full cursor-default items-start gap-2 py-1 pl-8 pr-3 text-left text-[12.5px] leading-snug text-text-secondary outline-none transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 text-[11px] leading-none ${SEVERITY_CLASS[entry.severity]}`}
      >
        {SEVERITY_GLYPH[entry.severity]}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.message}</span>
      <span className="shrink-0 text-text-muted">
        [{entry.line}, {entry.column}]
      </span>
    </div>
  );
}
