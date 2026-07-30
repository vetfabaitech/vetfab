"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorerStore } from "@/store/explorerStore";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { useSaveAllFiles } from "@/hooks/useSaveAllFiles";
import { IconChevronDown } from "@/components/icons";
import { IconWorkspace } from "./icons";
import { formatDate } from "@/utils/format";
import type { ProjectSummary } from "@/services/project/persistence";
import { ProjectLanguage, PROJECT_LANGUAGE_LABEL } from "@/services/workspace/languageTemplates";
import NewProjectDialog from "./NewProjectDialog";

const PROJECT_LANGUAGES: ProjectLanguage[] = ["verilog", "systemverilog", "vhdl"];

export default function WorkspaceHeader() {
  const workspaceName = useExplorerStore((s) => s.workspaceName);
  const currentProjectId = useExplorerStore((s) => s.currentProjectId);
  const recentWorkspaces = useExplorerStore((s) => s.recentWorkspaces);
  const openFolderFromFiles = useExplorerStore((s) => s.openFolderFromFiles);
  const saveWorkspaceSnapshot = useExplorerStore((s) => s.saveWorkspaceSnapshot);
  const loadWorkspaceSnapshot = useExplorerStore((s) => s.loadWorkspaceSnapshot);
  const listCloudProjects = useExplorerStore((s) => s.listCloudProjects);
  const openCloudProject = useExplorerStore((s) => s.openCloudProject);
  const startEmptyWorkspace = useExplorerStore((s) => s.startEmptyWorkspace);
  const startLanguageProjectWorkspace = useExplorerStore((s) => s.startLanguageProjectWorkspace);
  const importZipProject = useExplorerStore((s) => s.importZipProject);

  const { hasUnsavedChanges } = useSaveAllFiles();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setMenuOpen(false));

  const [newWorkspaceSectionOpen, setNewWorkspaceSectionOpen] = useState(false);
  const [importSectionOpen, setImportSectionOpen] = useState(false);
  const [newProjectKind, setNewProjectKind] = useState<ProjectLanguage | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [cloudProjects, setCloudProjects] = useState<ProjectSummary[] | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const handleToggleMenu = () => {
    setMenuOpen((v) => {
      const opening = !v;
      if (opening) {
        setCloudError(null);
        listCloudProjects()
          .then(setCloudProjects)
          .catch((err) => setCloudError(err instanceof Error ? err.message : "Failed to load"));
      } else {
        setNewWorkspaceSectionOpen(false);
        setImportSectionOpen(false);
      }
      return opening;
    });
  };

  const handleOpenCloudProject = (id: string) => {
    setMenuOpen(false);
    void openCloudProject(id);
  };

  const folderInputRef = useRef<HTMLInputElement>(null);
  const workspaceInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleOpenFolder = () => {
    setMenuOpen(false);
    folderInputRef.current?.click();
  };

  const handleOpenWorkspace = () => {
    setMenuOpen(false);
    workspaceInputRef.current?.click();
  };

  const handleSaveWorkspace = () => {
    setMenuOpen(false);
    saveWorkspaceSnapshot();
  };

  const handleEmptyWorkspace = () => {
    setMenuOpen(false);
    void startEmptyWorkspace();
  };

  const handleCreateLanguageProject = (projectName: string) => {
    const kind = newProjectKind;
    setNewProjectKind(null);
    setMenuOpen(false);
    if (kind) void startLanguageProjectWorkspace(kind, projectName);
  };

  return (
    <div className="relative shrink-0 border-b border-panel-border" ref={menuRef}>
      <button
        type="button"
        onClick={handleToggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex h-10 w-full items-center gap-2 px-3 text-left transition-colors duration-200 hover:bg-surface-hover"
      >
        <IconWorkspace className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-text-secondary">
          {workspaceName}
        </span>
        {hasUnsavedChanges && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="Unsaved changes" aria-label="Unsaved changes" />
        )}
        <IconChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error non-standard attribute for directory picking, supported in Chromium/Firefox
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => {
          if (e.target.files) void openFolderFromFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={workspaceInputRef}
        type="file"
        accept=".json,.code-workspace"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) loadWorkspaceSnapshot(await f.text());
          e.target.value = "";
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setImportError(null);
          const result = await importZipProject(f);
          if (result.ok) setMenuOpen(false);
          else setImportError(result.error ?? "Couldn't import that ZIP.");
        }}
      />

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute left-2 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-panel-border bg-surface-1 py-1 shadow-elevated"
          >
            <button
              type="button"
              onClick={() => setNewWorkspaceSectionOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
            >
              New Workspace
              <span className="text-text-muted">{newWorkspaceSectionOpen ? "▾" : "▸"}</span>
            </button>
            {newWorkspaceSectionOpen && (
              <div className="border-t border-panel-border/60 bg-surface-2 py-1">
                <MenuButton indent onClick={handleEmptyWorkspace}>
                  Empty Workspace
                </MenuButton>
                {PROJECT_LANGUAGES.map((kind) => (
                  <MenuButton key={kind} indent onClick={() => setNewProjectKind(kind)}>
                    {PROJECT_LANGUAGE_LABEL[kind]}
                  </MenuButton>
                ))}
                <button
                  type="button"
                  onClick={() => setImportSectionOpen((v) => !v)}
                  className="flex w-full items-center justify-between py-1.5 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
                >
                  Import Project…
                  <span className="text-text-muted">{importSectionOpen ? "▾" : "▸"}</span>
                </button>
                {importSectionOpen && (
                  <div className="border-t border-panel-border/40 py-1">
                    <MenuButton indent2 onClick={() => zipInputRef.current?.click()}>
                      Upload ZIP…
                    </MenuButton>
                    <MenuButton indent2 onClick={handleOpenFolder}>
                      Open existing folder…
                    </MenuButton>
                    <button
                      type="button"
                      disabled
                      title="Coming soon"
                      className="flex w-full cursor-not-allowed items-center py-1.5 pl-9 pr-3 text-left text-xs text-text-muted/60"
                    >
                      Clone from Git (coming soon)
                    </button>
                    {importError && <div className="px-3 py-1.5 text-xs text-error">{importError}</div>}
                  </div>
                )}
              </div>
            )}

            <div className="my-1 border-t border-panel-border" />

            <MenuButton onClick={handleOpenFolder}>Open Folder…</MenuButton>
            <MenuButton onClick={handleOpenWorkspace}>Open Workspace…</MenuButton>
            <MenuButton onClick={handleSaveWorkspace}>Save Workspace As…</MenuButton>

            <div className="my-1 border-t border-panel-border" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Recent Cloud Projects
            </div>
            {cloudError && <div className="px-3 py-1.5 text-xs text-error">{cloudError}</div>}
            {!cloudError && cloudProjects === null && (
              <div className="px-3 py-1.5 text-xs text-text-muted">Loading…</div>
            )}
            {!cloudError && cloudProjects?.length === 0 && (
              <div className="px-3 py-1.5 text-xs text-text-muted">Nothing saved yet</div>
            )}
            {cloudProjects?.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => handleOpenCloudProject(p.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/15 hover:text-accent ${
                  p.id === currentProjectId ? "text-accent" : "text-text-primary"
                }`}
              >
                <span className="truncate">{p.name}</span>
                <span className="ml-2 shrink-0 text-[10px] text-text-muted">
                  {new Date(p.updatedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}

            {recentWorkspaces.length > 0 && (
              <>
                <div className="my-1 border-t border-panel-border" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  Recent Workspaces
                </div>
                {recentWorkspaces.map((w) => (
                  <div key={w.name} className="flex items-center justify-between px-3 py-1.5 text-sm text-text-secondary">
                    <span className="truncate">{w.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-text-muted">{formatDate(w.savedAt)}</span>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {newProjectKind && (
        <NewProjectDialog kind={newProjectKind} onCancel={() => setNewProjectKind(null)} onCreate={handleCreateLanguageProject} />
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  indent,
  indent2,
}: {
  children: React.ReactNode;
  onClick: () => void;
  indent?: boolean;
  indent2?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-accent/15 hover:text-accent ${
        indent2 ? "pl-9 pr-3 text-xs" : indent ? "pl-6 pr-3 text-xs" : "px-3"
      }`}
    >
      {children}
    </button>
  );
}
