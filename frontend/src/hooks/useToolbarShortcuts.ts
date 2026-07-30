"use client";

import { useEffect } from "react";

interface ToolbarShortcutHandlers {
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
}

/** Global keybindings for the top toolbar: Ctrl+S (Save All), Ctrl+Shift+O
 * (Import), Ctrl+Shift+E (Export). Separate from MultiFileEditor's own
 * Ctrl+S handler (which clears just the active tab's dirty flag and kicks
 * off an immediate lint) -- both fire on the same keydown harmlessly, since
 * clearing an already-clean file is a no-op. */
export function useToolbarShortcuts({ onSave, onImport, onExport }: ToolbarShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        onSave();
      } else if (e.shiftKey && key === "o") {
        e.preventDefault();
        onImport();
      } else if (e.shiftKey && key === "e") {
        e.preventDefault();
        onExport();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onImport, onExport]);
}
