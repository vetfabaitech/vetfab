"use client";

import { useEffect, useState } from "react";
import { LogEntry } from "@/lib/types";
import LogList from "@/components/shared/LogList";
import { IconClose, IconExpand } from "./icons";

interface TerminalProps {
  logs: LogEntry[];
  onClear: () => void;
}

/** The right panel's "Simulation Output" pane -- the running program's own
 * $display/$monitor/$write output only (see page.tsx's channel routing:
 * `logs` here is already filtered to `channel === "simulation"`, i.e.
 * `stream === "stdout"` messages). Compiler/build-tool noise lives in the
 * separate "Build Log (Advanced)" bottom-panel tab instead -- deliberately
 * not duplicated here, see `BottomPanel.tsx`'s doc. Rendering itself is
 * `LogList` (shared with `LogPanel.tsx`'s Simulation Log tab); this
 * component just adds the expand-to-modal affordance specific to this
 * compact side pane. */
export default function Terminal({ logs, onClear }: TerminalProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-panel-border bg-terminal-bg shadow-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-sunken px-4 py-2">
        <span className="text-sm font-medium tracking-wide text-text-secondary">Simulation Output</span>
        <button
          type="button"
          onClick={() => setIsPopupOpen(true)}
          aria-label="Expand output"
          title="Expand output"
          className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
        >
          <IconExpand className="h-3.5 w-3.5" />
        </button>
      </div>
      <LogList entries={logs} onClear={onClear} emptyMessage="No simulation output yet." />

      {isPopupOpen && <OutputPopup logs={logs} onClear={onClear} onClose={() => setIsPopupOpen(false)} />}
    </div>
  );
}

function OutputPopup({ logs, onClear, onClose }: { logs: LogEntry[]; onClear: () => void; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Output"
        className="flex h-full max-h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-lg border border-panel-border bg-terminal-bg shadow-elevated"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-sunken px-4 py-2.5">
          <span className="text-xs font-semibold tracking-wide text-text-secondary">OUTPUT</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close output"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <LogList entries={logs} onClear={onClear} showSearch emptyMessage="No simulation output yet." />
      </div>
    </div>
  );
}
