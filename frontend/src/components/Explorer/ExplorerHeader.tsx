"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useExplorerStore } from "@/store/explorerStore";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { SortField, IconSize as IconSizeT } from "@/types/explorer";
import { IconCheck } from "./icons";
import {
  IconCloudUpload,
  IconCollapseAll,
  IconExpandAll,
  IconMoreHorizontal,
  IconNewFile,
  IconNewFolder,
  IconRefresh,
  IconUpload,
  IconUploadFolder,
} from "./icons";

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "type", label: "Type" },
  { field: "extension", label: "Extension" },
  { field: "modified", label: "Modified Date" },
  { field: "created", label: "Created Date" },
  { field: "size", label: "Size" },
];

const ICON_SIZES: { value: IconSizeT; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function ToolbarButton({
  onClick,
  label,
  children,
  active,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-200 ${
        active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export default function ExplorerHeader() {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const focusedId = useExplorerStore((s) => s.focusedId);
  const isRefreshing = useExplorerStore((s) => s.isRefreshing);
  const isSaving = useExplorerStore((s) => s.isSaving);
  const syncError = useExplorerStore((s) => s.syncError);
  const lastSavedAt = useExplorerStore((s) => s.lastSavedAt);
  const sort = useExplorerStore((s) => s.sort);
  const view = useExplorerStore((s) => s.view);

  const createFile = useExplorerStore((s) => s.createFile);
  const createFolder = useExplorerStore((s) => s.createFolder);
  const refresh = useExplorerStore((s) => s.refresh);
  const saveToServer = useExplorerStore((s) => s.saveToServer);
  const collapseAll = useExplorerStore((s) => s.collapseAll);
  const expandAll = useExplorerStore((s) => s.expandAll);
  const uploadFiles = useExplorerStore((s) => s.uploadFiles);
  const setSort = useExplorerStore((s) => s.setSort);
  const setView = useExplorerStore((s) => s.setView);

  const targetParentId = useMemo(() => {
    if (focusedId && nodes[focusedId]) {
      const node = nodes[focusedId];
      return node.kind === "folder" ? node.id : node.parentId ?? rootId;
    }
    return rootId;
  }, [focusedId, nodes, rootId]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState<"none" | "sort" | "view">("none");
  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => {
    setMenuOpen(false);
    setSection("none");
  });

  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-panel-border px-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Explorer</span>

      <div className="flex items-center gap-0.5">
        <ToolbarButton label="New File" onClick={() => createFile(targetParentId)}>
          <IconNewFile className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="New Folder" onClick={() => createFolder(targetParentId)}>
          <IconNewFolder className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label={
            syncError
              ? `Save/Upload Project — last error: ${syncError}`
              : isSaving
                ? "Saving…"
                : lastSavedAt
                  ? `Save/Upload Project (last saved ${new Date(lastSavedAt).toLocaleTimeString()})`
                  : "Save/Upload Project"
          }
          onClick={() => void saveToServer()}
        >
          <IconCloudUpload className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""} ${syncError ? "text-error" : ""}`} />
        </ToolbarButton>
        <ToolbarButton label={syncError ? `Refresh Explorer — last error: ${syncError}` : "Refresh Explorer"} onClick={() => void refresh()}>
          <IconRefresh
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""} ${syncError ? "text-error" : ""}`}
          />
        </ToolbarButton>
        <ToolbarButton label="Collapse All" onClick={collapseAll}>
          <IconCollapseAll className="h-4 w-4" />
        </ToolbarButton>

        <div className="relative" ref={menuRef}>
          <ToolbarButton
            label="More Actions"
            active={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <IconMoreHorizontal className="h-4 w-4" />
          </ToolbarButton>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-md border border-panel-border bg-surface-1 py-1 shadow-elevated"
              >
                <MenuItem
                  icon={<IconExpandAll className="h-4 w-4" />}
                  label="Expand All"
                  onClick={() => {
                    expandAll();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<IconUpload className="h-4 w-4" />}
                  label="Upload File…"
                  onClick={() => {
                    uploadFileRef.current?.click();
                    setMenuOpen(false);
                  }}
                />
                <MenuItem
                  icon={<IconUploadFolder className="h-4 w-4" />}
                  label="Upload Folder…"
                  onClick={() => {
                    uploadFolderRef.current?.click();
                    setMenuOpen(false);
                  }}
                />

                <div className="my-1 border-t border-panel-border" />

                <button
                  type="button"
                  onClick={() => setSection(section === "sort" ? "none" : "sort")}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                >
                  Sort By
                  <span className="text-text-muted">{section === "sort" ? "▾" : "▸"}</span>
                </button>
                {section === "sort" && (
                  <div className="border-t border-panel-border/60 bg-surface-2 py-1">
                    {SORT_FIELDS.map((f) => (
                      <button
                        key={f.field}
                        type="button"
                        onClick={() => setSort({ field: f.field })}
                        className="flex w-full items-center gap-2 py-1 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
                      >
                        <span className="w-3.5">{sort.field === f.field && <IconCheck className="h-3.5 w-3.5 text-accent" />}</span>
                        {f.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-panel-border/60" />
                    <button
                      type="button"
                      onClick={() => setSort({ direction: sort.direction === "asc" ? "desc" : "asc" })}
                      className="flex w-full items-center gap-2 py-1 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
                    >
                      {sort.direction === "asc" ? "Ascending ✓" : "Descending ✓"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSort({
                          folderPosition:
                            sort.folderPosition === "first"
                              ? "last"
                              : sort.folderPosition === "last"
                                ? "none"
                                : "first",
                        })
                      }
                      className="flex w-full items-center gap-2 py-1 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
                    >
                      Folders:{" "}
                      {sort.folderPosition === "first"
                        ? "First"
                        : sort.folderPosition === "last"
                          ? "Last"
                          : "Mixed"}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSection(section === "view" ? "none" : "view")}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                >
                  View Options
                  <span className="text-text-muted">{section === "view" ? "▾" : "▸"}</span>
                </button>
                {section === "view" && (
                  <div className="border-t border-panel-border/60 bg-surface-2 py-1">
                    <ToggleRow
                      label="Show Hidden Files"
                      checked={view.showHiddenFiles}
                      onClick={() => setView({ showHiddenFiles: !view.showHiddenFiles })}
                    />
                    <ToggleRow
                      label="Compact Folders"
                      checked={view.compactFolders}
                      onClick={() => setView({ compactFolders: !view.compactFolders })}
                    />
                    <ToggleRow
                      label="Show Extensions"
                      checked={view.showExtensions}
                      onClick={() => setView({ showExtensions: !view.showExtensions })}
                    />
                    <ToggleRow
                      label="Show Modified Date"
                      checked={view.showModifiedDate}
                      onClick={() => setView({ showModifiedDate: !view.showModifiedDate })}
                    />
                    <ToggleRow
                      label="Show File Size"
                      checked={view.showFileSize}
                      onClick={() => setView({ showFileSize: !view.showFileSize })}
                    />
                    <div className="my-1 border-t border-panel-border/60" />
                    {ICON_SIZES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setView({ iconSize: s.value })}
                        className="flex w-full items-center gap-2 py-1 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
                      >
                        <span className="w-3.5">{view.iconSize === s.value && <IconCheck className="h-3.5 w-3.5 text-accent" />}</span>
                        {s.label} Icons
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <input
        ref={uploadFileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files, rootId);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadFolderRef}
        type="file"
        className="hidden"
        // @ts-expect-error non-standard attribute for directory picking
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files, rootId);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <span className="text-text-muted">{icon}</span>
      {label}
    </button>
  );
}

function ToggleRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 py-1 pl-6 pr-3 text-left text-xs text-text-secondary hover:bg-surface-hover"
    >
      <span className="w-3.5">{checked && <IconCheck className="h-3.5 w-3.5 text-accent" />}</span>
      {label}
    </button>
  );
}
