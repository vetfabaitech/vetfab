"use client";

interface NoTestbenchDialogProps {
  onContinueWithoutTestbench: () => void;
  onCreateManually: () => void;
  onCancel: () => void;
}

/** Shown instead of firing /api/v1/execute when Run/Run All find no
 * testbench in the workspace -- same modal chrome as
 * CloseTabConfirmDialog/ImportRejectedDialog. Never silently guesses what
 * the user wants: "Continue Without Testbench" runs a real Verilator
 * lint-only pass (see execution.mode="lint", app/page.tsx's
 * handleContinueWithoutTestbench) rather than skipping the run entirely or
 * erroring against an empty payload. */
export default function NoTestbenchDialog({ onContinueWithoutTestbench, onCreateManually, onCancel }: NoTestbenchDialogProps) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="No testbench found"
        className="w-96 overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">No Testbench Found</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
            This workspace does not contain a testbench. Choose how you want to continue.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-panel-border px-4 py-3">
          <button
            type="button"
            onClick={onContinueWithoutTestbench}
            className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-blue-500"
          >
            Continue Without Testbench
            <span className="mt-0.5 block text-[10px] font-normal text-white/80">
              Runs syntax checking / linting / elaboration only.
            </span>
          </button>
          <button
            type="button"
            onClick={onCreateManually}
            className="w-full rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-surface-hover"
          >
            Create Testbench Manually
            <span className="mt-0.5 block text-[10px] font-normal text-text-muted">
              Creates an empty testbench file and opens it.
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-200 hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
