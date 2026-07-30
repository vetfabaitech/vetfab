import { create } from "zustand";
import type { OutlineNode } from "@/services/analysis/hdlOutline";

interface EditorRuntimeState {
  cursorLine: number;
  cursorColumn: number;
  /** File the current `outline` belongs to -- guards StatusBar/StickyModuleHeader
   * against briefly showing the previous file's outline during a tab switch. */
  outlinePath: string | null;
  outline: OutlineNode[];
  /** First fully-visible line in the editor's viewport -- drives
   * StickyModuleHeader (a module's header pins once you've scrolled past its
   * own declaration line). Updated from Monaco's `onDidScrollChange`. */
  topVisibleLine: number;

  setCursor: (line: number, column: number) => void;
  setOutline: (path: string, outline: OutlineNode[]) => void;
  resetOutline: () => void;
  setTopVisibleLine: (line: number) => void;
}

/** Session-only (never persisted) editor telemetry -- cursor position and the
 * active file's parsed outline -- fed by listeners `MultiFileEditor.tsx`
 * attaches to the one live Monaco editor instance (see EditorManager). Kept
 * separate from `useEditorStore`/`useExplorerStore` since this changes on
 * every cursor move/scroll tick and has no business being persisted or
 * triggering the explorer tree's own re-renders. Consumed by `StatusBar`,
 * `StickyModuleHeader`, and the Search Symbols panel/Search Everywhere
 * palette (via the workspace symbol index, which reuses the same
 * `buildHdlOutline` call this store's producer already makes -- no file gets
 * parsed twice for these features). */
export const useEditorRuntimeStore = create<EditorRuntimeState>((set) => ({
  cursorLine: 1,
  cursorColumn: 1,
  outlinePath: null,
  outline: [],
  topVisibleLine: 1,

  setCursor: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setOutline: (path, outline) => set({ outlinePath: path, outline }),
  resetOutline: () => set({ outlinePath: null, outline: [] }),
  setTopVisibleLine: (line) => set({ topVisibleLine: line }),
}));
