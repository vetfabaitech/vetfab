"use client";

import { motion } from "framer-motion";
import TerminalPanel from "@/components/TerminalPanel";
import LogPanel from "@/components/LogPanel";
import BuildLogPanel from "@/components/BuildLogPanel";
import ProblemsPanel from "@/components/Problems/ProblemsPanel";
import CommandConsole from "@/components/BottomPanel/CommandConsole";
import WatchPanel from "@/components/BottomPanel/WatchPanel";
import ObjectsPanel from "@/components/BottomPanel/ObjectsPanel";
import BreakpointsPanel from "@/components/BottomPanel/BreakpointsPanel";
import {
  IconAlertTriangle,
  IconHammer,
  IconMonitor,
  IconPanelCollapseRight,
  IconPanelExpandRight,
  IconTerminalPrompt,
  IconTree,
  IconBreakpointDot,
} from "@/components/icons";
import { IconEye } from "@/components/Explorer/icons";
import { useRightPanelStore, type BottomTab } from "@/store/panelStore";
import { useBreakpointStore } from "@/store/breakpointStore";
import type { ProblemEntry } from "@/types/diagnostics";
import type { LogEntry } from "@/lib/types";

interface TerminalFile {
  name: string;
  content: string;
}

interface BottomPanelProps {
  projectId: string;
  files: TerminalFile[];
  onWaveformAvailable?: (url: string) => void;
  problems: ProblemEntry[];
  onSelectProblem: (entry: ProblemEntry) => void;
  executionLogs: LogEntry[];
  onClearLog: () => void;
  buildLogEntries: LogEntry[];
  onClearBuildLog: () => void;
  onRun: () => void;
  onStop: () => void;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 py-2.5 text-[13px] font-medium outline-none transition-colors duration-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
        active ? "text-accent" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {children}
      {active && (
        <motion.span
          layoutId="bottom-panel-active-underline"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

/** The bottom debug workspace (Feature 9): Problems / Terminal / Simulation
 * Log / Build Log (Advanced) / Command Console / Watch / Objects /
 * Breakpoints. The running program's own stdout stays in the right panel's
 * "Simulation Output" pane (`Terminal.tsx`) only -- deliberately not
 * duplicated here; raw compiler/build-tool output instead lives in this
 * panel's own "Build Log (Advanced)" tab (`BuildLogPanel.tsx`), hidden
 * behind an explicit click since most users never need to see a `make`
 * invocation (see page.tsx's channel routing for exactly which WS messages
 * land where). Every tab body stays permanently mounted, toggled only via
 * `display` --
 * the Terminal tab hosts live `ShellTerminal` WebSocket sessions that must
 * survive switching away and back, and Watch/Objects both keep a VCD fetch
 * alive via `useVcdSignals`'s cache that would otherwise be needlessly
 * re-triggered by mount/unmount. Active tab and maximized state persist via
 * `useRightPanelStore` (localStorage), mirroring `explorerStore.activityView`'s
 * precedent for the left sidebar. */
export default function BottomPanel({
  projectId,
  files,
  onWaveformAvailable,
  problems,
  onSelectProblem,
  executionLogs,
  onClearLog,
  buildLogEntries,
  onClearBuildLog,
  onRun,
  onStop,
}: BottomPanelProps) {
  const activeTab = useRightPanelStore((s) => s.bottomPanelTab);
  const setActiveTab = useRightPanelStore((s) => s.setBottomPanelTab);
  const maximized = useRightPanelStore((s) => s.bottomPanelMaximized);
  const toggleMaximized = useRightPanelStore((s) => s.toggleBottomPanelMaximized);
  const breakpointCount = useBreakpointStore((s) => Object.keys(s.breakpoints).length);

  const show = (tab: BottomTab) => (activeTab === tab ? "block" : "none");

  return (
    <div className="flex h-full flex-col bg-terminal-bg">
      <div
        role="tablist"
        aria-label="Bottom panel"
        className="scrollbar-thin flex h-10 shrink-0 items-center gap-5 overflow-x-auto border-b border-panel-border bg-surface-sunken px-4"
      >
        <TabButton active={activeTab === "problems"} onClick={() => setActiveTab("problems")}>
          <IconAlertTriangle className="h-3.5 w-3.5" />
          Problems{problems.length > 0 ? ` (${problems.length})` : ""}
        </TabButton>
        <TabButton active={activeTab === "terminal"} onClick={() => setActiveTab("terminal")}>
          Terminal
        </TabButton>
        <TabButton active={activeTab === "log"} onClick={() => setActiveTab("log")}>
          <IconMonitor className="h-3.5 w-3.5" />
          Simulation Log
        </TabButton>
        <TabButton active={activeTab === "buildLog"} onClick={() => setActiveTab("buildLog")}>
          <IconHammer className="h-3.5 w-3.5" />
          Build Log (Advanced)
        </TabButton>
        <TabButton active={activeTab === "console"} onClick={() => setActiveTab("console")}>
          <IconTerminalPrompt className="h-3.5 w-3.5" />
          Console
        </TabButton>
        <TabButton active={activeTab === "watch"} onClick={() => setActiveTab("watch")}>
          <IconEye className="h-3.5 w-3.5" />
          Watch
        </TabButton>
        <TabButton active={activeTab === "objects"} onClick={() => setActiveTab("objects")}>
          <IconTree className="h-3.5 w-3.5" />
          Objects
        </TabButton>
        <TabButton active={activeTab === "breakpoints"} onClick={() => setActiveTab("breakpoints")}>
          <IconBreakpointDot className="h-3 w-3" />
          Breakpoints{breakpointCount > 0 ? ` (${breakpointCount})` : ""}
        </TabButton>

        <button
          type="button"
          onClick={toggleMaximized}
          aria-label={maximized ? "Restore panel" : "Maximize panel"}
          title={maximized ? "Restore panel" : "Maximize panel"}
          className="ml-auto shrink-0 rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
        >
          {maximized ? <IconPanelExpandRight className="h-3.5 w-3.5 rotate-90" /> : <IconPanelCollapseRight className="h-3.5 w-3.5 rotate-90" />}
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <div className="h-full" style={{ display: show("problems") }}>
          <ProblemsPanel problems={problems} onSelect={onSelectProblem} />
        </div>
        <div className="h-full" style={{ display: show("terminal") }}>
          <TerminalPanel projectId={projectId} files={files} onWaveformAvailable={onWaveformAvailable} />
        </div>
        <div className="h-full" style={{ display: show("log") }}>
          <LogPanel entries={executionLogs} onClear={onClearLog} />
        </div>
        <div className="h-full" style={{ display: show("buildLog") }}>
          <BuildLogPanel entries={buildLogEntries} onClear={onClearBuildLog} />
        </div>
        <div className="h-full" style={{ display: show("console") }}>
          <CommandConsole onRun={onRun} onStop={onStop} />
        </div>
        <div className="h-full" style={{ display: show("watch") }}>
          <WatchPanel />
        </div>
        <div className="h-full" style={{ display: show("objects") }}>
          <ObjectsPanel />
        </div>
        <div className="h-full" style={{ display: show("breakpoints") }}>
          <BreakpointsPanel />
        </div>
      </div>
    </div>
  );
}
