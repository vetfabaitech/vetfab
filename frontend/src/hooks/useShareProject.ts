"use client";

import { useCallback, useState } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useToastStore } from "@/store/toastStore";
import { createShareLink } from "@/services/project/share";

/** Toolbar Share: generates a project link (mock for now -- see
 * services/project/share.ts for the swap-in point for a real backend call),
 * copies it to the clipboard, and confirms via toast. */
export function useShareProject() {
  const currentProjectId = useExplorerStore((s) => s.currentProjectId);
  const workspaceName = useExplorerStore((s) => s.workspaceName);
  const showToast = useToastStore((s) => s.show);
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const { url } = await createShareLink(currentProjectId, workspaceName);
      await navigator.clipboard.writeText(url);
      showToast("Project link copied successfully.");
    } catch {
      showToast("Couldn't copy the project link.", "error");
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, currentProjectId, workspaceName, showToast]);

  return { share, isSharing };
}
