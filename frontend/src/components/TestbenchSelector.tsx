"use client";

import { useMemo } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useAnalysisStore } from "@/services/analysis/stateManager";
import { listTestbenchFiles } from "@/services/analysis/testbenchDiscovery";
import { IconChevronDown, IconFlask } from "./icons";

const AUTO_VALUE = "";

/** Lets the user pick which single testbench "Run" executes when a workspace
 * has more than one -- compiling/running every testbench-category file at
 * once would mix their $dumpfile calls into one ambiguous (or overwritten)
 * waveform, so exactly one is selected here and threaded through to
 * execution.compileFiles. "Run All" (see RunAllButton) bypasses this and
 * runs every testbench in `listTestbenchFiles` regardless of this choice. */
export default function TestbenchSelector() {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const selectedTestbenchId = useAnalysisStore((s) => s.selectedTestbenchId);
  const setSelectedTestbenchId = useAnalysisStore((s) => s.setSelectedTestbenchId);

  const testbenchFiles = useMemo(() => listTestbenchFiles(nodes, rootId), [nodes, rootId]);

  if (testbenchFiles.length === 0) return null;

  return (
    <div className="relative">
      <select
        value={selectedTestbenchId ?? AUTO_VALUE}
        onChange={(e) => setSelectedTestbenchId(e.target.value === AUTO_VALUE ? null : e.target.value)}
        aria-label="Select testbench to run"
        title="Select which testbench to run"
        className="appearance-none rounded-lg border border-transparent bg-transparent py-1.5 pl-7 pr-8 text-sm font-medium text-text-primary outline-none transition-colors duration-200 hover:bg-surface-hover focus:border-accent"
      >
        <option value={AUTO_VALUE}>Testbench: Auto</option>
        {testbenchFiles.map((f) => (
          <option key={f.id} value={f.id}>
            {f.relativePath}
          </option>
        ))}
      </select>
      <IconFlask className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
      <IconChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
    </div>
  );
}
