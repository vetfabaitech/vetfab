import { create } from "zustand";

export type CompileFileStatus = "success" | "error";

interface CompileStatusState {
  statusByFile: Record<string, CompileFileStatus>;
  recordCompileResult: (compiledFileIds: string[], erroredFileIds: string[], runSucceeded: boolean) => void;
}

/** Tracks each file's last known compile outcome for the Explorer's
 * "Compiled successfully" / "Contains errors" badges (Feature 2).
 * Deliberately NOT persisted -- a "compiled" checkmark surviving a page
 * refresh from a previous session would be misleading, so this always
 * reflects only the current session's last Run/Run All.
 *
 * Deliberately NOT derived from Monaco markers the way the Problems panel
 * is (see `useProblems.ts`): file badges must stay accurate even for files
 * that aren't open as editor tabs, but compiler/lint markers are only ever
 * painted onto already-open models (see `useCompilerMarkers.ts`). */
export const useCompileStatusStore = create<CompileStatusState>()((set) => ({
  statusByFile: {},

  recordCompileResult: (compiledFileIds, erroredFileIds, runSucceeded) =>
    set((state) => {
      const next = { ...state.statusByFile };
      const errored = new Set(erroredFileIds);
      for (const fileId of compiledFileIds) {
        if (errored.has(fileId)) {
          next[fileId] = "error";
        } else if (runSucceeded) {
          next[fileId] = "success";
        }
        // Otherwise the run failed but this particular file wasn't flagged --
        // ambiguous (could be fine, could be blocked by an earlier file's
        // error), so leave its previous status untouched rather than guess.
      }
      return { statusByFile: next };
    }),
}));
