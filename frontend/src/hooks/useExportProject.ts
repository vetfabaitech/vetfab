"use client";

import { useCallback, useState } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useToastStore } from "@/store/toastStore";

/** Toolbar Export: zips the entire current workspace (reusing the Explorer's
 * existing `downloadFolder`, which already preserves directory structure and
 * includes every file under the root -- source, testbenches, constraints,
 * README, etc.) and triggers a browser download. */
export function useExportProject() {
  const downloadFolder = useExplorerStore((s) => s.downloadFolder);
  const rootId = useExplorerStore((s) => s.rootId);
  const workspaceName = useExplorerStore((s) => s.workspaceName);
  const showToast = useToastStore((s) => s.show);
  const [isExporting, setIsExporting] = useState(false);

  const exportProject = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadFolder(rootId);
      showToast(`Exported ${workspaceName}.zip`);
    } catch {
      showToast("Export failed", "error");
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, downloadFolder, rootId, workspaceName, showToast]);

  return { exportProject, isExporting };
}
