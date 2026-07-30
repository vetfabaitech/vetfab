import { create } from "zustand";

export interface WatchedSignal {
  id: string;
  /** VCD hierarchy path, e.g. "tb.dut.counter" -- matched against
   * `VcdSignal.hierarchyPath` to resolve type/width/value for display. */
  path: string;
  name: string;
  pinned: boolean;
}

interface WatchState {
  /** Session-only, like `breakpointStore` -- a watch list tied to signal
   * paths from a specific run's VCD would go stale across different
   * projects/reloads. */
  signals: WatchedSignal[];
  add: (path: string, name: string) => void;
  remove: (id: string) => void;
  togglePin: (id: string) => void;
  clear: () => void;
}

export const useWatchStore = create<WatchState>((set, get) => ({
  signals: [],

  add: (path, name) => {
    if (get().signals.some((s) => s.path === path)) return;
    set((state) => ({ signals: [...state.signals, { id: path, path, name, pinned: false }] }));
  },

  remove: (id) => set((state) => ({ signals: state.signals.filter((s) => s.id !== id) })),

  togglePin: (id) =>
    set((state) => ({
      signals: state.signals.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
    })),

  clear: () => set({ signals: [] }),
}));
