"use client";

import LogList from "@/components/shared/LogList";
import { LogEntry } from "@/lib/types";

interface LogPanelProps {
  entries: LogEntry[];
  onClear: () => void;
}

/** BottomPanel's "Simulation Log" tab -- the step-by-step Analyze/Compile/
 * Run narration for the current run (including the final "Completed"/
 * "Syntax Check Passed" line, see page.tsx's result handler), timestamped
 * and independent from raw compiler/simulator stdout/stderr (split between
 * the right panel's "Simulation Output" pane, `Terminal.tsx`, and the
 * "Build Log (Advanced)" tab, `BuildLogPanel.tsx` -- see page.tsx's channel
 * routing) and from the Terminal tab (an actual shell). Rendering itself is
 * `LogList` (shared with those) -- this component just supplies the
 * Simulation Log-specific options (timestamps, search, downloadable). */
export default function LogPanel({ entries, onClear }: LogPanelProps) {
  return (
    <div className="flex h-full flex-col bg-editor-bg">
      <LogList
        entries={entries}
        onClear={onClear}
        showTimestamps
        showSearch
        downloadFilename="simulation-log.txt"
        emptyMessage='No execution logs yet. Press "Run" to execute.'
      />
    </div>
  );
}
