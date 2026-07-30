import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface EditorTab {
  fileId: string;
  /** Unpinned tabs are VS Code-style "preview" tabs: opening another file
   * while a preview tab is showing replaces it in place instead of adding a
   * new tab. Pinning (double-click) makes the tab permanent. */
  pinned: boolean;
}

interface OpenFileOptions {
  pin?: boolean;
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;

  openFile: (fileId: string, opts?: OpenFileOptions) => void;
  pinTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  closeTab: (fileId: string) => void;
  closeOthers: (fileId: string) => void;
  closeToRight: (fileId: string) => void;
  closeAll: () => void;
}

/** Owns which files are open as editor tabs and which is active -- the
 * "Editor Store" / "Open Tabs Store" / "Active File Store" from the spec,
 * intentionally unified since tab list and active tab must always stay
 * mutually consistent (splitting them risks the active id pointing at a
 * closed tab). File content/metadata/dirty state stays in the explorer
 * store; this store only tracks view/tab concerns. */
export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: (fileId, opts = {}) => {
    const state = get();
    const existing = state.tabs.find((t) => t.fileId === fileId);

    if (existing) {
      set({
        activeTabId: fileId,
        tabs: opts.pin && !existing.pinned
          ? state.tabs.map((t) => (t.fileId === fileId ? { ...t, pinned: true } : t))
          : state.tabs,
      });
      return;
    }

    if (opts.pin) {
      set({ tabs: [...state.tabs, { fileId, pinned: true }], activeTabId: fileId });
      return;
    }

    const previewIndex = state.tabs.findIndex((t) => !t.pinned);
    if (previewIndex === -1) {
      set({ tabs: [...state.tabs, { fileId, pinned: false }], activeTabId: fileId });
    } else {
      const tabs = [...state.tabs];
      tabs[previewIndex] = { fileId, pinned: false };
      set({ tabs, activeTabId: fileId });
    }
  },

  pinTab: (fileId) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.fileId === fileId ? { ...t, pinned: true } : t)),
    })),

  setActiveTab: (fileId) => set({ activeTabId: fileId }),

  closeTab: (fileId) => {
    const state = get();
    const idx = state.tabs.findIndex((t) => t.fileId === fileId);
    if (idx === -1) return;

    const tabs = state.tabs.filter((t) => t.fileId !== fileId);
    let activeTabId = state.activeTabId;
    if (activeTabId === fileId) {
      const neighbor = tabs[idx] ?? tabs[idx - 1] ?? null;
      activeTabId = neighbor ? neighbor.fileId : null;
    }
    set({ tabs, activeTabId });
  },

  closeOthers: (fileId) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.fileId === fileId),
      activeTabId: fileId,
    })),

  closeToRight: (fileId) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.fileId === fileId);
      if (idx === -1) return state;
      const tabs = state.tabs.slice(0, idx + 1);
      const activeTabId = tabs.some((t) => t.fileId === state.activeTabId) ? state.activeTabId : fileId;
      return { tabs, activeTabId };
    }),

  closeAll: () => set({ tabs: [], activeTabId: null }),
    }),
    {
      // Open tabs + active file persist across refresh so the editor comes
      // back exactly where the user left it -- restored alongside the
      // explorer tree (see explorerStore's persist), whose node ids these
      // tabs reference.
      name: "vetfab-editor-tabs-v1",
      partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId }),
      skipHydration: true,
    }
  )
);
