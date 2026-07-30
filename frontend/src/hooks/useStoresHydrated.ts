"use client";

import { useEffect, useState } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import { useRightPanelStore } from "@/store/panelStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getStoredAuthToken, getTokenSubject } from "@/lib/auth";

// Whichever account's data is currently sitting in the explorer/editor
// localStorage caches below -- not itself sensitive, just a tag.
const WORKSPACE_OWNER_KEY = "vetfab-workspace-owner";
// Persisted caches that hold actual project content (open tree, tabs, file
// text) -- must match explorerStore.ts's / editorStore.ts's persist `name`.
// Deliberately excludes panelStore/settingsStore: those are UI prefs only
// (panel width, theme, ...), nothing account-specific to leak.
const WORKSPACE_CACHE_KEYS = ["vetfab-explorer-ui-v1", "vetfab-editor-tabs-v1"];

/** Both stores persist unconditionally, with no notion of *whose* workspace
 * is cached -- sign out, sign back in as a different account, and without
 * this check the new session would render the previous account's last-open
 * project straight out of localStorage until they happened to open
 * something else from Cloud Projects. Runs before rehydrate() so a stale
 * account's cache is wiped before it's ever read into the stores at all. */
function clearWorkspaceCacheOnAccountSwitch(): void {
  const token = getStoredAuthToken();
  const currentSub = token ? getTokenSubject(token) : null;
  const cachedOwner = window.localStorage.getItem(WORKSPACE_OWNER_KEY);

  if (currentSub && currentSub !== cachedOwner) {
    for (const key of WORKSPACE_CACHE_KEYS) window.localStorage.removeItem(key);
    window.localStorage.setItem(WORKSPACE_OWNER_KEY, currentSub);
  }
}

/** Rehydrates the persisted explorer + editor + right-panel stores (all use
 * `skipHydration: true` to avoid an SSR/client mismatch) and reports when
 * ALL have finished. Callers gate the IDE render on this so the workspace
 * is restored from localStorage *before* first paint -- otherwise the store
 * renders its seed (`vetfab_project`) tree for a frame and only then swaps
 * to the restored one, which is the "dummy workspace flashes / wins" bug.
 *
 * localStorage is synchronous, so in practice this resolves on the very
 * next tick -- the loader it gates is effectively invisible, not a spinner
 * the user waits on. */
export function useStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    clearWorkspaceCacheOnAccountSwitch();
    Promise.all([
      useExplorerStore.persist.rehydrate(),
      useEditorStore.persist.rehydrate(),
      useRightPanelStore.persist.rehydrate(),
      useSettingsStore.persist.rehydrate(),
    ]).then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return hydrated;
}
