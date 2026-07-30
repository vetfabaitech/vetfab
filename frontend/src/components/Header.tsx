"use client";

import { HdlLanguage } from "@/lib/types";
import LanguageSelector from "./LanguageSelector";
import TestbenchSelector from "./TestbenchSelector";
import RunButton from "./RunButton";
import RunAllButton from "./RunAllButton";
import StopButton from "./StopButton";
import { IconChip } from "./icons";
import ThemeToggle from "./ThemeToggle";
import ProfileMenu from "./ProfileMenu";
import SaveButton from "./Toolbar/SaveButton";
import ImportButton from "./Toolbar/ImportButton";
import ExportButton from "./Toolbar/ExportButton";
import ShareButton from "./Toolbar/ShareButton";
import ImportRejectedDialog from "./Toolbar/ImportRejectedDialog";
import { useSaveAllFiles } from "@/hooks/useSaveAllFiles";
import { useImportProject } from "@/hooks/useImportProject";
import { useExportProject } from "@/hooks/useExportProject";
import { useShareProject } from "@/hooks/useShareProject";
import { useToolbarShortcuts } from "@/hooks/useToolbarShortcuts";

interface HeaderProps {
  language: HdlLanguage;
  onLanguageChange: (language: HdlLanguage) => void;
  onRun: () => void;
  onRunAll: () => void;
  onStop: () => void;
  isRunning: boolean;
}

export default function Header({ language, onLanguageChange, onRun, onRunAll, onStop, isRunning }: HeaderProps) {
  const { saveAll, hasUnsavedChanges } = useSaveAllFiles();
  const { inputRef: importInputRef, trigger: triggerImport, handleChange: handleImportChange, rejectMessage, dismissReject } =
    useImportProject();
  const { exportProject, isExporting } = useExportProject();
  const { share, isSharing } = useShareProject();

  useToolbarShortcuts({ onSave: saveAll, onImport: triggerImport, onExport: exportProject });

  return (
    <header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-y-2 border-b border-panel-border bg-header-bg px-4 shadow-panel sm:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <IconChip className="h-6 w-6 text-accent" />
        <h1 className="hidden text-[15px] font-semibold tracking-tight text-text-primary sm:block">
          HDL WebIDE
        </h1>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-2">
        <div className="flex shrink-0 items-center gap-1 border-r border-panel-border pr-3 sm:gap-1.5 sm:pr-4">
          <SaveButton onClick={saveAll} disabled={!hasUnsavedChanges} />
          <ImportButton onClick={triggerImport} />
          <ExportButton onClick={exportProject} isExporting={isExporting} />
          <ShareButton onClick={share} isSharing={isSharing} />
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-1 sm:gap-2.5 sm:pl-2">
          <RunButton onClick={onRun} isLoading={isRunning} />
          <RunAllButton onClick={onRunAll} isLoading={isRunning} />
          <StopButton onClick={onStop} disabled={!isRunning} />
        </div>

        <div className="hidden shrink-0 items-center gap-1 pl-2 lg:flex">
          <LanguageSelector value={language} onChange={onLanguageChange} />
          <TestbenchSelector />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <ProfileMenu />
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".zip,.v,.sv,.vhd,.vh,.txt"
        multiple
        className="hidden"
        onChange={handleImportChange}
      />
      {rejectMessage && <ImportRejectedDialog message={rejectMessage} onClose={dismissReject} />}
    </header>
  );
}
