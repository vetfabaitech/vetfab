interface ExecutionSummaryProps {
  mode: "simulate" | "lint";
  status: "completed" | "failed" | "terminated";
  warningCount: number;
  errorCount: number;
  buildTimeMs: number | null;
  runTimeMs: number | null;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Compact status strip shown above Simulation Output, driven directly by
 * the backend's `mode`/`status`/counts/timing on the final WS "result"
 * message (see page.tsx) -- never inferred from output shape, so a lint run
 * can never show "Simulation Completed" and vice versa. */
export default function ExecutionSummary({ mode, status, warningCount, errorCount, buildTimeMs, runTimeMs }: ExecutionSummaryProps) {
  const ok = status === "completed";
  const glyph = ok ? "✔" : status === "terminated" ? "…" : "✖";
  const buildLabel = `${glyph} Build ${ok || status === "terminated" ? "Successful" : "Failed"}`;
  const secondLabel = ok
    ? mode === "lint"
      ? "✔ Syntax Check Passed"
      : "✔ Simulation Completed"
    : status === "terminated"
      ? "… Terminated"
      : null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-panel-border bg-surface-1 px-3 py-2 text-xs">
      <span className={ok || status === "terminated" ? "font-medium text-success" : "font-medium text-error"}>{buildLabel}</span>
      {secondLabel && <span className="font-medium text-success">{secondLabel}</span>}
      <span className="text-text-muted">
        Warnings: <span className="text-text-secondary">{warningCount}</span>
      </span>
      <span className="text-text-muted">
        Errors: <span className="text-text-secondary">{errorCount}</span>
      </span>
      {buildTimeMs !== null && (
        <span className="text-text-muted">
          Build Time: <span className="text-text-secondary">{formatMs(buildTimeMs)}</span>
        </span>
      )}
      {runTimeMs !== null && (
        <span className="text-text-muted">
          Simulation Time: <span className="text-text-secondary">{formatMs(runTimeMs)}</span>
        </span>
      )}
    </div>
  );
}
