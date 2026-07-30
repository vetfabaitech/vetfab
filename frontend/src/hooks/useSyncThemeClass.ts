"use client";

import { useEffect } from "react";
import { useSettingsStore } from "@/store/settingsStore";

/** Keeps <html>'s `dark` class in sync with `settingsStore.appTheme` for as
 * long as whichever page calls this is mounted. Call this only after that
 * page's own store-hydration gate has resolved (see useStoresHydrated) --
 * layout.tsx's blocking inline script already applies the correct class
 * before first paint, so the first run here is always a no-op confirmation;
 * this hook's only real job is reacting to a *live* toggle afterwards. */
export function useSyncThemeClass(): void {
  const appTheme = useSettingsStore((s) => s.appTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", appTheme === "dark");
  }, [appTheme]);
}
