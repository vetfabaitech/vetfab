"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { useExplorerStore } from "@/store/explorerStore";
import FileIcon from "@/components/Explorer/FileIcon";
import { IconClose, IconCollapse, IconExpand } from "@/components/icons";
import { IconLock } from "@/components/Explorer/icons";
import CloseTabConfirmDialog from "./CloseTabConfirmDialog";

interface EditorTabBarProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function EditorTabBar({ isExpanded, onToggleExpand }: EditorTabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const pinTab = useEditorStore((s) => s.pinTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  const nodes = useExplorerStore((s) => s.nodes);
  const clearFileDirty = useExplorerStore((s) => s.clearFileDirty);

  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  const requestClose = (fileId: string) => {
    const node = nodes[fileId];
    if (node?.kind === "file" && node.dirty) {
      setPendingCloseId(fileId);
    } else {
      closeTab(fileId);
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-end justify-between border-b border-panel-border bg-surface-sunken px-2 pt-1.5">
      <div className="scrollbar-thin flex h-full flex-1 items-end gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const node = nodes[tab.fileId];
          if (!node || node.kind !== "file") return null;
          const active = tab.fileId === activeTabId;

          return (
            <div
              key={tab.fileId}
              onClick={() => setActiveTab(tab.fileId)}
              onDoubleClick={() => pinTab(tab.fileId)}
              role="tab"
              aria-selected={active}
              title={node.name}
              className={`group flex h-8 shrink-0 cursor-default items-center gap-1.5 rounded-t-lg border-t-2 px-3.5 text-[13px] transition-all duration-200 ${
                active
                  ? "-mb-px border-t-accent bg-editor-bg text-text-primary shadow-[0_-1px_3px_rgba(0,0,0,0.04)]"
                  : "border-t-transparent text-text-muted hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <FileIcon name={node.name} kind="file" iconSize="small" />
              <span className={`max-w-[140px] truncate ${!tab.pinned ? "italic" : ""}`}>{node.name}</span>
              {node.locked && <IconLock className="h-3 w-3 shrink-0 text-text-muted" />}
              {node.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary" aria-label="Unsaved changes" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(tab.fileId);
                }}
                aria-label={`Close ${node.name}`}
                className="ml-0.5 shrink-0 rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        aria-label={isExpanded ? "Restore layout" : "Expand editor"}
        className="mb-1 mx-1 shrink-0 rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
      >
        {isExpanded ? <IconCollapse className="h-4 w-4" /> : <IconExpand className="h-4 w-4" />}
      </button>

      {pendingCloseId && nodes[pendingCloseId]?.kind === "file" && (
        <CloseTabConfirmDialog
          fileName={nodes[pendingCloseId].name}
          onSave={() => {
            clearFileDirty(pendingCloseId);
            closeTab(pendingCloseId);
            setPendingCloseId(null);
          }}
          onDontSave={() => {
            closeTab(pendingCloseId);
            setPendingCloseId(null);
          }}
          onCancel={() => setPendingCloseId(null)}
        />
      )}
    </div>
  );
}
