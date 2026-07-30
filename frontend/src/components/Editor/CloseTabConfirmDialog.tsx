"use client";

interface CloseTabConfirmDialogProps {
  fileName: string;
  onSave: () => void;
  onDontSave: () => void;
  onCancel: () => void;
}

export default function CloseTabConfirmDialog({ fileName, onSave, onDontSave, onCancel }: CloseTabConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        className="w-96 overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Unsaved changes</h2>
          <p className="mt-1.5 text-xs text-text-muted">
            <span className="text-text-primary">{fileName}</span> has unsaved changes. Do you want to save before
            closing?
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-panel-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-200 hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDontSave}
            className="rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:border-error/50 hover:text-error"
          >
            Don&apos;t Save
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
