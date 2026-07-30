"use client";

import { IconWarning } from "@/components/Explorer/icons";

interface ImportRejectedDialogProps {
  message: string;
  onClose: () => void;
}

/** Friendly modal shown when Import receives an unsupported file type --
 * mirrors CloseTabConfirmDialog's modal chrome so it reads as the same
 * design language as the rest of the IDE's dialogs. */
export default function ImportRejectedDialog({ message, onClose }: ImportRejectedDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="Import failed"
        className="w-96 overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <IconWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Couldn&apos;t import project</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end border-t border-panel-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-blue-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
