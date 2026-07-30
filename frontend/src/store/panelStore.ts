import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightPanelMode = "both" | "output" | "waveform";

/** The bottom debug workspace's dockable tabs (Feature 9). Terminal keeps
 * its live `ShellTerminal` WebSocket sessions across tab switches (see
 * `BottomPanel.tsx`'s doc), same as before -- this just adds the new
 * professional-EDA-tool tabs alongside it. */
export type BottomTab = "problems" | "terminal" | "log" | "buildLog" | "console" | "watch" | "objects" | "breakpoints";

interface RightPanelState {
  collapsed: boolean;
  width: number;
  mode: RightPanelMode;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setWidth: (px: number) => void;
  setMode: (mode: RightPanelMode) => void;

  bottomPanelTab: BottomTab;
  bottomPanelMaximized: boolean;
  setBottomPanelTab: (tab: BottomTab) => void;
  toggleBottomPanelMaximized: () => void;
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 460;

/** Feature 3 (Collapsible Right Panel) + Feature 9 (bottom debug workspace):
 * remembers the Output/Waveform column's collapsed state/width/mode AND the
 * bottom panel's active tab/maximized state across sessions -- same
 * `persist` + `skipHydration` pattern `explorerStore`/`editorStore` already
 * use (mirroring `explorerStore.activityView`'s persisted-active-tab
 * precedent), rehydrated alongside them in `useStoresHydrated.ts`. Kept in
 * this one store rather than a second "bottom panel store" since both are
 * "which dockable panel is showing/how big is it" concerns of the same
 * shape. */
export const useRightPanelStore = create<RightPanelState>()(
  persist(
    (set) => ({
      collapsed: false,
      width: DEFAULT_WIDTH,
      mode: "both",

      setCollapsed: (collapsed) => set({ collapsed }),
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
      setWidth: (px) => set({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px)) }),
      setMode: (mode) => set({ mode }),

      bottomPanelTab: "terminal",
      bottomPanelMaximized: false,
      setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
      toggleBottomPanelMaximized: () => set((state) => ({ bottomPanelMaximized: !state.bottomPanelMaximized })),
    }),
    {
      name: "vetfab-right-panel-v1",
      skipHydration: true,
    }
  )
);
