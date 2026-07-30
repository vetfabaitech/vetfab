import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppTheme = "light" | "dark";
export type CompilerId = "iverilog" | "verilator" | "vivado" | "modelsim";

function computeInitialAppTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export interface SettingsValues {
  // Appearance -- drives both the app chrome (see layout.tsx's blocking
  // script + useSyncThemeClass) and Monaco's theme (CodeEditor.tsx). One
  // switch for the whole app rather than a separate "editor theme", so
  // there's a single obvious place light/dark lives.
  appTheme: AppTheme;

  // Editor
  fontSize: number;
  tabWidth: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;

  // Editor behavior
  autoSave: boolean;
  formatOnSave: boolean;
  smoothScrolling: boolean;

  // Terminal
  terminalFontSize: number;
  terminalCursorBlink: boolean;

  // Workspace
  defaultCompiler: CompilerId;
  defaultSimTimeoutSec: number;
}

interface SettingsState extends SettingsValues {
  update: (partial: Partial<SettingsValues>) => void;
  toggleAppTheme: () => void;
  resetDefaults: () => void;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  appTheme: computeInitialAppTheme(),
  fontSize: 14,
  tabWidth: 4,
  wordWrap: false,
  minimap: true,
  lineNumbers: true,

  autoSave: false,
  formatOnSave: false,
  smoothScrolling: false,

  terminalFontSize: 13,
  terminalCursorBlink: true,

  defaultCompiler: "verilator",
  defaultSimTimeoutSec: 30,
};

/** All IDE preferences (appearance, editor, terminal, workspace defaults)
 * behind the /settings page -- one flat persisted store so every reader
 * (CodeEditor, ShellTerminal, the settings page) subscribes directly instead
 * of drilling props through Header/MultiFileEditor. Mirrors editorStore's
 * `skipHydration: true` + explicit rehydrate-on-mount pattern (see
 * useStoresHydrated) to avoid an SSR/localStorage mismatch flash. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (partial) => set(partial),
      toggleAppTheme: () => set((s) => ({ appTheme: s.appTheme === "dark" ? "light" : "dark" })),
      resetDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "vetfab-settings-v1",
      skipHydration: true,
    }
  )
);

/** Name of the localStorage key zustand's `persist` writes to (see above) --
 * exported so `layout.tsx`'s blocking pre-hydration script can read the same
 * value directly and apply the `dark` class before first paint, without
 * waiting on React/zustand to rehydrate. Keep in sync with the `name` above. */
export const SETTINGS_STORAGE_KEY = "vetfab-settings-v1";
