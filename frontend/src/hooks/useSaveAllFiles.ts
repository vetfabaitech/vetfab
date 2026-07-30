"use client";

import { useCallback } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useToastStore } from "@/store/toastStore";

/** Toolbar Save: clears the dirty flag on every modified file and shows the
 * "Saved" toast. Content is already live in each node (see
 * `updateFileContent`), so this is a save-all-buffers action, not a
 * fetch/persist round trip -- that's what the Explorer header's separate
 * "Save/Upload Project" (cloud) button is for. */
export function useSaveAllFiles() {
  const hasUnsavedChanges = useExplorerStore((s) =>
    Object.values(s.nodes).some((n) => n.kind === "file" && n.dirty)
  );
  const saveAllFiles = useExplorerStore((s) => s.saveAllFiles);
  const showToast = useToastStore((s) => s.show);

  const saveAll = useCallback(() => {
    if (!hasUnsavedChanges) return;
    saveAllFiles();
    showToast("Saved");
  }, [hasUnsavedChanges, saveAllFiles, showToast]);

  return { saveAll, hasUnsavedChanges };
}
