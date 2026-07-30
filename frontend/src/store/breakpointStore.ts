import { create } from "zustand";

export interface Breakpoint {
  id: string;
  fileId: string;
  line: number;
  enabled: boolean;
}

function keyFor(fileId: string, line: number): string {
  return `${fileId}:${line}`;
}

interface BreakpointState {
  /** Keyed by `${fileId}:${line}` -- one entry per gutter-toggled line.
   * Deliberately NOT `persist`-wrapped: "Persist during current session"
   * (the spec) means surviving tab switches/navigation while the app stays
   * open, not surviving a reload, so plain in-memory Zustand state (same
   * choice `compileStatusStore`/`simulationStore` made for session-scoped
   * runtime state) is the right fit -- a breakpoint set that silently
   * outlived edits to the file across reloads would drift from the source. */
  breakpoints: Record<string, Breakpoint>;
  toggle: (fileId: string, line: number) => void;
  remove: (fileId: string, line: number) => void;
  setEnabled: (fileId: string, line: number, enabled: boolean) => void;
  clearFile: (fileId: string) => void;
}

export const useBreakpointStore = create<BreakpointState>((set) => ({
  breakpoints: {},

  toggle: (fileId, line) =>
    set((state) => {
      const key = keyFor(fileId, line);
      const next = { ...state.breakpoints };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { id: key, fileId, line, enabled: true };
      }
      return { breakpoints: next };
    }),

  remove: (fileId, line) =>
    set((state) => {
      const next = { ...state.breakpoints };
      delete next[keyFor(fileId, line)];
      return { breakpoints: next };
    }),

  setEnabled: (fileId, line, enabled) =>
    set((state) => {
      const key = keyFor(fileId, line);
      const existing = state.breakpoints[key];
      if (!existing) return state;
      return { breakpoints: { ...state.breakpoints, [key]: { ...existing, enabled } } };
    }),

  clearFile: (fileId) =>
    set((state) => {
      const next = { ...state.breakpoints };
      for (const key of Object.keys(next)) {
        if (next[key].fileId === fileId) delete next[key];
      }
      return { breakpoints: next };
    }),
}));

/** Breakpoints for one file, sorted by line -- used both by the gutter
 * decoration sync (`useBreakpoints.ts`) and the Breakpoints list panel. */
export function breakpointsForFile(breakpoints: Record<string, Breakpoint>, fileId: string): Breakpoint[] {
  return Object.values(breakpoints)
    .filter((b) => b.fileId === fileId)
    .sort((a, b) => a.line - b.line);
}
