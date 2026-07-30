"use client";

import type { ReactNode } from "react";

interface ToolbarIconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** Appended to the tooltip/aria-label, e.g. "Ctrl+S". */
  shortcutHint?: string;
}

/** Compact icon-only toolbar button shared by Save/Import/Export/Share --
 * tooltip via `title`, VS Code-style hover/active/disabled treatment. Kept
 * separate from `RunButton`/`StopButton` (which are labeled pill buttons for
 * the compile/simulate actions) since this group is icon-only by design. */
export default function ToolbarIconButton({ label, onClick, children, disabled, shortcutHint }: ToolbarIconButtonProps) {
  const title = shortcutHint ? `${label} (${shortcutHint})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-text-secondary transition-all duration-200 hover:bg-surface-hover hover:text-text-primary hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:active:scale-100"
    >
      {children}
    </button>
  );
}
