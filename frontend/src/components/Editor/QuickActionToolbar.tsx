"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useSimulationStore } from "@/store/simulationStore";
import { useExportProject } from "@/hooks/useExportProject";
import { editorManager } from "@/services/editor/EditorManager";
import ToolbarIconButton from "@/components/Toolbar/ToolbarIconButton";
import {
  IconSave,
  IconUndo,
  IconRedo,
  IconHammer,
  IconPlay,
  IconPause,
  IconStop,
  IconRestart,
  IconStepForward,
  IconContinue,
  IconFormat,
  IconWaveformSmall,
  IconExport,
  IconSpinner,
} from "@/components/icons";

interface QuickActionToolbarProps {
  canFormat: boolean;
  hasUnsavedChanges: boolean;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onRestart: () => void;
  onCompile: () => Promise<void> | void;
  onFormat: () => void;
  onSaveAll: () => void;
}

/** Backend confirmed fire-and-forget (batch compile -> run -> kill-on-stop,
 * no pause/step/resume capability -- see `execution_manager.py`): Pause,
 * Step, and Continue are scaffolded here disabled rather than faked, so the
 * toolbar is honest about what's real today while staying ready to enable
 * them the moment an interactive simulator session exists (Icarus Verilog's
 * own `vvp -i`/VPI does support this, just nothing drives it that way yet). */
const NOT_YET_SUPPORTED = "Requires an interactive simulator backend (not yet available)";

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-panel-border" aria-hidden="true" />;
}

/** Compact icon toolbar docked directly above the Monaco editor (the EDA
 * "quick actions" strip: Save/Undo/Redo/Compile/Run/Stop/Format/Waveform/
 * Export). Every action here reuses the app's existing implementation of it
 * (useExportProject, EditorManager's undo/redo, the Verilator lint pass via
 * `onCompile`, the shared format pipeline, the Simulation Manager's
 * waveform URL) -- this is a second set of buttons for the same operations
 * Header/BottomPanel already expose, not a second implementation of any of
 * them. */
export default function QuickActionToolbar({
  canFormat,
  hasUnsavedChanges,
  isRunning,
  onRun,
  onStop,
  onRestart,
  onCompile,
  onFormat,
  onSaveAll,
}: QuickActionToolbarProps) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeSession = useSimulationStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId));
  const { exportProject, isExporting } = useExportProject();
  const [isCompiling, setIsCompiling] = useState(false);

  const hasActiveFile = !!activeTabId;
  const waveformUrl = activeSession?.waveformUrl ?? null;

  const handleCompile = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    try {
      await onCompile();
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDownloadWaveform = () => {
    if (!waveformUrl) return;
    const a = document.createElement("a");
    a.href = waveformUrl;
    a.download = "";
    a.click();
  };

  return (
    <div
      role="toolbar"
      aria-label="Quick actions"
      className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-panel-border bg-surface-2 px-2"
    >
      <ToolbarIconButton label="Save All" shortcutHint="Ctrl+S" onClick={onSaveAll} disabled={!hasUnsavedChanges}>
        <IconSave className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Undo" onClick={() => editorManager.undo()} disabled={!hasActiveFile}>
        <IconUndo className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Redo" onClick={() => editorManager.redo()} disabled={!hasActiveFile}>
        <IconRedo className="h-[18px] w-[18px]" />
      </ToolbarIconButton>

      <Divider />

      <ToolbarIconButton
        label="Compile"
        shortcutHint="Ctrl+B"
        onClick={handleCompile}
        disabled={!hasActiveFile || isCompiling}
      >
        {isCompiling ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconHammer className="h-[18px] w-[18px]" />}
      </ToolbarIconButton>
      <ToolbarIconButton label="Run Simulation" shortcutHint="Ctrl+R" onClick={onRun} disabled={isRunning}>
        {isRunning ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconPlay className="h-[18px] w-[18px]" />}
      </ToolbarIconButton>
      <ToolbarIconButton label={`Pause Simulation — ${NOT_YET_SUPPORTED}`} onClick={() => undefined} disabled>
        <IconPause className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Stop Simulation" onClick={onStop} disabled={!isRunning}>
        <IconStop className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Restart Simulation" onClick={onRestart} disabled={!isRunning && !hasActiveFile}>
        <IconRestart className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label={`Step — ${NOT_YET_SUPPORTED}`} onClick={() => undefined} disabled>
        <IconStepForward className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label={`Continue — ${NOT_YET_SUPPORTED}`} onClick={() => undefined} disabled>
        <IconContinue className="h-[18px] w-[18px]" />
      </ToolbarIconButton>

      <Divider />

      <ToolbarIconButton label="Format Code" onClick={onFormat} disabled={!canFormat}>
        <IconFormat className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Download Waveform" onClick={handleDownloadWaveform} disabled={!waveformUrl}>
        <IconWaveformSmall className="h-[18px] w-[18px]" />
      </ToolbarIconButton>
      <ToolbarIconButton label="Export Project" shortcutHint="Ctrl+Shift+E" onClick={exportProject} disabled={isExporting}>
        {isExporting ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconExport className="h-[18px] w-[18px]" />}
      </ToolbarIconButton>
    </div>
  );
}
