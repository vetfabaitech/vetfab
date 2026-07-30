"use client";

import LogList from "@/components/shared/LogList";
import { LogEntry } from "@/lib/types";

interface BuildLogPanelProps {
  entries: LogEntry[];
  onClear: () => void;
}

/** BottomPanel's "Build Log (Advanced)" tab -- the raw make/g++/Archive/
 * verilator-invocation/linker output (page.tsx's `channel === "build"`
 * entries: everything from `stream: "compiler"` plus run-phase
 * `stream: "stderr"`) that used to be mixed into the right panel's
 * "Simulation Output" pane. Hidden behind an explicit tab click by design
 * (see BottomPanel's tab list) -- most users never need to see a `make`
 * invocation; Problems already surfaces the same errors/warnings as
 * clickable, structured entries, and Simulation Output already shows the
 * actual $display output cleanly. This tab exists for the advanced user who
 * wants to see exactly what command ran and why. */
export default function BuildLogPanel({ entries, onClear }: BuildLogPanelProps) {
  return (
    <div className="flex h-full flex-col bg-editor-bg">
      <LogList
        entries={entries}
        onClear={onClear}
        showTimestamps
        showSearch
        downloadFilename="build-log.txt"
        emptyMessage="No build output yet."
      />
    </div>
  );
}
