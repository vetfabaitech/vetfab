"use client";

import { useSettingsStore } from "@/store/settingsStore";
import { IconMoon, IconSun } from "./icons";

/** Quick-access light/dark switch in the header, mirroring the log-in app's
 * standalone ThemeToggle -- backed by the same `settingsStore.appTheme` the
 * Settings page's Appearance section edits, so both stay in sync. */
export default function ThemeToggle() {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const toggleAppTheme = useSettingsStore((s) => s.toggleAppTheme);
  const isDark = appTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleAppTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex items-center justify-center rounded-lg p-2 text-text-muted transition-all duration-200 hover:bg-surface-hover hover:text-text-primary hover:shadow-sm"
    >
      {isDark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}
