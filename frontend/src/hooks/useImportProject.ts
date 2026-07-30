"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useToastStore } from "@/store/toastStore";

/** Toolbar Import: owns the hidden `<input type=file>` and routes its
 * selection through `explorerStore.importProject` (ZIP extraction / loose
 * HDL+text file upload / rejection), surfacing a friendly dialog message on
 * failure instead of throwing. */
export function useImportProject() {
  const importProject = useExplorerStore((s) => s.importProject);
  const showToast = useToastStore((s) => s.show);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);

  const trigger = useCallback(() => inputRef.current?.click(), []);

  const handleChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      e.target.value = "";
      if (!fileList || fileList.length === 0) return;

      const result = await importProject(fileList);
      if (!result.ok) {
        setRejectMessage(result.error ?? "That file couldn't be imported.");
        return;
      }
      showToast("Project imported");
    },
    [importProject, showToast]
  );

  const dismissReject = useCallback(() => setRejectMessage(null), []);

  return { inputRef, trigger, handleChange, rejectMessage, dismissReject };
}
