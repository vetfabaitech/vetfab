"use client";

import { useEffect, useMemo, useState } from "react";
import { IconKeyboard } from "@/components/icons";

interface ShortcutEntry {
  keys: string;
  description: string;
  category: "Editing" | "Navigation" | "Simulation" | "Project";
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: "Ctrl+S", description: "Save all files", category: "Project" },
  { keys: "Ctrl+Shift+O", description: "Import project", category: "Project" },
  { keys: "Ctrl+Shift+E", description: "Export project", category: "Project" },
  { keys: "Ctrl+Z", description: "Undo", category: "Editing" },
  { keys: "Ctrl+Y", description: "Redo", category: "Editing" },
  { keys: "Format Code (toolbar)", description: "Format the active file with Verible", category: "Editing" },
  { keys: "Ctrl+B", description: "Compile (Verilator lint)", category: "Simulation" },
  { keys: "Ctrl+R", description: "Run simulation", category: "Simulation" },
  { keys: "Stop (toolbar)", description: "Stop the running simulation", category: "Simulation" },
  { keys: "Ctrl+P", description: "Search Everywhere (files, modules, signals, commands)", category: "Navigation" },
  { keys: "Ctrl+Shift+F", description: "Global search (Search Symbols panel)", category: "Navigation" },
  { keys: "Ctrl+/", description: "Toggle this keyboard shortcut help", category: "Navigation" },
  { keys: "Double-click tab", description: "Pin the tab", category: "Navigation" },
  { keys: "Click minimap", description: "Jump to that section of the file", category: "Navigation" },
];

const CATEGORY_ORDER: ShortcutEntry["category"][] = ["Editing", "Navigation", "Simulation", "Project"];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

/** Help -> Keyboard Shortcuts (also Ctrl+/) -- a searchable, categorized
 * reference. Deliberately a static, hand-maintained list rather than derived
 * from the various keydown handlers scattered across
 * useToolbarShortcuts/useIdeGlobalShortcuts/MultiFileEditor: those encode
 * *behavior*, this encodes *documentation*, and keeping them separate is
 * what makes this easy to extend with non-keyboard affordances too (e.g. the
 * toolbar-only Format/Stop actions listed above). */
export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const [query, setQuery] = useState("");

  // Reset the filter whenever the modal (re)opens -- adjusted during render
  // (React's documented pattern for state that depends on a changed prop)
  // rather than in an effect, so it takes effect in the same commit instead
  // of flashing the previous filter for one frame.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.filter((s) => s.keys.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
          <div className="flex items-center gap-2">
            <IconKeyboard className="h-4 w-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          </div>
          <kbd className="rounded border border-panel-border px-1.5 py-0.5 text-[10px] text-text-muted">Esc</kbd>
        </div>
        <div className="border-b border-panel-border px-4 py-2.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter shortcuts…"
            aria-label="Filter shortcuts"
            className="w-full rounded-md border border-panel-border bg-app-bg px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors duration-200 focus:border-accent"
          />
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-muted">No shortcuts match &quot;{query}&quot;.</p>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const entries = filtered.filter((s) => s.category === category);
              if (entries.length === 0) return null;
              return (
                <div key={category} className="mb-4 last:mb-0">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    {category}
                  </h3>
                  <div className="flex flex-col gap-1">
                    {entries.map((s) => (
                      <div
                        key={s.keys + s.description}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs transition-colors duration-150 hover:bg-surface-hover"
                      >
                        <span className="text-text-secondary">{s.description}</span>
                        <kbd className="shrink-0 rounded border border-panel-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
