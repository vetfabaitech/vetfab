"use client";

import { useEffect } from "react";
import { useExplorerStore } from "@/store/explorerStore";

interface IdeGlobalShortcutHandlers {
  onOpenPalette: () => void;
  onOpenShortcutHelp: () => void;
}

/** App-shell-level keybindings that must work even with no file open: Ctrl+P
 * (Search Everywhere), Ctrl+/ (Keyboard Shortcuts help), Ctrl+Shift+F (jump
 * to the sidebar's Search Symbols view). Kept separate from
 * `useToolbarShortcuts.ts` (Save/Import/Export) and MultiFileEditor's own
 * Ctrl+S/Ctrl+B/Ctrl+R (editor-scoped, need the active tab/model) -- same
 * one-hook-per-concern shape, just for the shortcuts that open an overlay
 * rather than act on the active file. */
export function useIdeGlobalShortcuts({ onOpenPalette, onOpenShortcutHelp }: IdeGlobalShortcutHandlers) {
  const setActivityView = useExplorerStore((s) => s.setActivityView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        onOpenPalette();
      } else if (key === "/") {
        e.preventDefault();
        onOpenShortcutHelp();
      } else if (e.shiftKey && key === "f") {
        e.preventDefault();
        setActivityView("search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenPalette, onOpenShortcutHelp, setActivityView]);
}
