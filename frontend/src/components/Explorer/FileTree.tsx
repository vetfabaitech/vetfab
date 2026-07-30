"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMonaco } from "@monaco-editor/react";
import { List, useListRef } from "react-window";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import { useCompileStatusStore } from "@/store/compileStatusStore";
import { useProblems } from "@/hooks/useProblems";
import { useMemoizedIdSet } from "@/hooks/useMemoizedIdSet";
import { flattenSearch, flattenTree } from "@/utils/treeUtils";
import { FlatRow } from "@/types/explorer";
import TreeRow, { TreeRowSharedProps } from "./TreeRow";
import ContextMenu from "./ContextMenu";
import PropertiesDialog from "./PropertiesDialog";
import { IconFilesActivity, IconNewFile, IconNewFolder, IconSearch, IconUpload } from "./icons";

const ROW_HEIGHT = 30;
const PAGE_SIZE = 14;

export default function FileTree() {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const expanded = useExplorerStore((s) => s.expanded);
  const loadingIds = useExplorerStore((s) => s.loadingIds);
  const sort = useExplorerStore((s) => s.sort);
  const view = useExplorerStore((s) => s.view);
  const searchQuery = useExplorerStore((s) => s.searchQuery);

  const selectedIds = useExplorerStore((s) => s.selectedIds);
  const focusedId = useExplorerStore((s) => s.focusedId);
  const activeFileId = useExplorerStore((s) => s.activeFileId);
  const renamingId = useExplorerStore((s) => s.renamingId);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const pinnedIds = useExplorerStore((s) => s.pinnedIds);
  const dragIds = useExplorerStore((s) => s.dragIds);
  const dropTargetId = useExplorerStore((s) => s.dropTargetId);
  const dropPosition = useExplorerStore((s) => s.dropPosition);
  const revealId = useExplorerStore((s) => s.revealId);

  // File status badges (Feature 2): errors reuse the same Monaco marker
  // mirror the Problems panel is built on (useProblems.ts), unioned with
  // compileStatusStore's compile-time error signal since markers alone miss
  // files that aren't currently open as tabs. useMemoizedIdSet keeps these
  // Sets referentially stable across renders where membership hasn't
  // actually changed, so a marker update elsewhere doesn't force every
  // virtualized row to re-render.
  const monaco = useMonaco();
  const problems = useProblems({ monaco, nodes });
  const compileStatusByFile = useCompileStatusStore((s) => s.statusByFile);
  const errorFileIds = useMemoizedIdSet(
    useMemo(() => {
      const ids: string[] = [];
      for (const p of problems) if (p.severity === "error") ids.push(p.fileId);
      for (const [fileId, status] of Object.entries(compileStatusByFile)) if (status === "error") ids.push(fileId);
      return ids;
    }, [problems, compileStatusByFile])
  );
  const compiledFileIds = useMemoizedIdSet(
    useMemo(
      () =>
        Object.entries(compileStatusByFile)
          .filter(([fileId, status]) => status === "success" && !errorFileIds.has(fileId))
          .map(([fileId]) => fileId),
      [compileStatusByFile, errorFileIds]
    )
  );

  const toggleExpand = useExplorerStore((s) => s.toggleExpand);
  const selectSingle = useExplorerStore((s) => s.selectSingle);
  const toggleSelect = useExplorerStore((s) => s.toggleSelect);
  const rangeSelect = useExplorerStore((s) => s.rangeSelect);
  const selectAllVisible = useExplorerStore((s) => s.selectAllVisible);
  const moveFocus = useExplorerStore((s) => s.moveFocus);
  const arrowRight = useExplorerStore((s) => s.arrowRight);
  const arrowLeft = useExplorerStore((s) => s.arrowLeft);
  const startRename = useExplorerStore((s) => s.startRename);
  const commitRename = useExplorerStore((s) => s.commitRename);
  const cancelRename = useExplorerStore((s) => s.cancelRename);
  const deleteSelected = useExplorerStore((s) => s.deleteSelected);
  const copySelection = useExplorerStore((s) => s.copySelection);
  const cutSelection = useExplorerStore((s) => s.cutSelection);
  const pasteInto = useExplorerStore((s) => s.pasteInto);
  const openFile = useExplorerStore((s) => s.openFile);
  const openContextMenu = useExplorerStore((s) => s.openContextMenu);
  const setDrag = useExplorerStore((s) => s.setDrag);
  const setDropTarget = useExplorerStore((s) => s.setDropTarget);
  const moveNodes = useExplorerStore((s) => s.moveNodes);
  const endDrag = useExplorerStore((s) => s.endDrag);
  const undo = useExplorerStore((s) => s.undo);
  const clearReveal = useExplorerStore((s) => s.clearReveal);
  const setScrollOffset = useExplorerStore((s) => s.setScrollOffset);
  const ensureLoaded = useExplorerStore((s) => s.ensureLoaded);

  const openEditorTab = useEditorStore((s) => s.openFile);

  const searchActive = searchQuery.trim().length > 0;

  const rows = useMemo(() => {
    if (searchActive) return flattenSearch(nodes, rootId, sort, view, searchQuery);
    return flattenTree({ nodes, rootId, expanded, loadingIds, sort, view });
  }, [nodes, rootId, expanded, loadingIds, sort, view, searchQuery, searchActive]);

  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!revealId) return;
    const idx = rows.findIndex((r) => r.id === revealId);
    if (idx !== -1) {
      listRef.current?.scrollToRow({ index: idx, align: "smart", behavior: "smooth" });
    }
    const t = setTimeout(() => clearReveal(), 1400);
    return () => clearTimeout(t);
  }, [revealId, rows, listRef, clearReveal]);

  const handleRowClick = useCallback(
    (row: FlatRow, e: React.MouseEvent) => {
      if (e.shiftKey) {
        rangeSelect(row.id, rows);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(row.id);
        return;
      }
      selectSingle(row.id);
      if (row.kind === "file") {
        openFile(row.id);
        openEditorTab(row.id);
      }
    },
    [rangeSelect, toggleSelect, selectSingle, rows, openFile, openEditorTab]
  );

  const handleRowActivate = useCallback(
    (row: FlatRow) => {
      if (row.kind === "folder") {
        toggleExpand(row.id);
      } else {
        openFile(row.id);
        openEditorTab(row.id, { pin: true });
      }
    },
    [toggleExpand, openFile, openEditorTab]
  );

  const handleRowContextMenu = useCallback(
    (row: FlatRow, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, row.id);
    },
    [openContextMenu]
  );

  const handleDragStartRow = useCallback(
    (row: FlatRow, e: React.DragEvent) => {
      const ids = selectedIds.includes(row.id) ? selectedIds : [row.id];
      if (!selectedIds.includes(row.id)) selectSingle(row.id);
      setDrag(ids);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", ids.join(","));
    },
    [selectedIds, selectSingle, setDrag]
  );

  const handleDragOverRow = useCallback(
    (row: FlatRow, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const ratio = offsetY / rect.height;
      let position: "before" | "after" | "inside";
      if (row.kind === "folder") {
        position = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
      } else {
        position = ratio < 0.5 ? "before" : "after";
      }
      setDropTarget(row.id, position);

      if (position === "inside" && row.kind === "folder" && !expanded[row.id]) {
        if (hoverTargetRef.current !== row.id) {
          hoverTargetRef.current = row.id;
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => {
            toggleExpand(row.id);
          }, 650);
        }
      } else {
        hoverTargetRef.current = null;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      }
    },
    [setDropTarget, expanded, toggleExpand]
  );

  const handleDropRow = useCallback(
    (row: FlatRow, e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const state = useExplorerStore.getState();
      const ids = state.dragIds.length ? state.dragIds : e.dataTransfer.getData("text/plain").split(",");
      const position = state.dropPosition;
      const targetNode = nodes[row.id];
      if (!targetNode) return;

      if (position === "inside" && targetNode.kind === "folder") {
        moveNodes(ids, targetNode.id);
      } else {
        const parentId = targetNode.parentId;
        if (!parentId) return;
        const parent = nodes[parentId];
        if (parent.kind !== "folder") return;
        const idx = parent.children.indexOf(row.id);
        const beforeId = position === "before" ? row.id : parent.children[idx + 1] ?? null;
        moveNodes(ids, parentId, beforeId);
      }
      endDrag();
    },
    [nodes, moveNodes, endDrag]
  );

  const handleDragEndRow = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTargetRef.current = null;
    endDrag();
  }, [endDrag]);

  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleContainerDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const state = useExplorerStore.getState();
      const ids = state.dragIds.length ? state.dragIds : e.dataTransfer.getData("text/plain").split(",");
      if (ids.length && ids[0]) moveNodes(ids, rootId);
      endDrag();
    },
    [moveNodes, rootId, endDrag]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (renamingId) return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllVisible(rows);
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const target = focusedId ? nodes[focusedId] : null;
        const targetId = target ? (target.kind === "folder" ? target.id : target.parentId ?? rootId) : rootId;
        pasteInto(targetId);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          moveFocus("down", rows, { extend: e.shiftKey });
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocus("up", rows, { extend: e.shiftKey });
          break;
        case "Home":
          e.preventDefault();
          moveFocus("home", rows, { extend: e.shiftKey });
          break;
        case "End":
          e.preventDefault();
          moveFocus("end", rows, { extend: e.shiftKey });
          break;
        case "PageUp":
          e.preventDefault();
          moveFocus("pageUp", rows, { extend: e.shiftKey, pageSize: PAGE_SIZE });
          break;
        case "PageDown":
          e.preventDefault();
          moveFocus("pageDown", rows, { extend: e.shiftKey, pageSize: PAGE_SIZE });
          break;
        case "ArrowRight":
          if (focusedId) {
            e.preventDefault();
            arrowRight(focusedId);
          }
          break;
        case "ArrowLeft":
          if (focusedId) {
            e.preventDefault();
            arrowLeft(focusedId);
          }
          break;
        case "Enter": {
          const row = rows.find((r) => r.id === focusedId);
          if (row) {
            e.preventDefault();
            handleRowActivate(row);
          }
          break;
        }
        case "F2":
          if (focusedId) {
            e.preventDefault();
            startRename(focusedId);
          }
          break;
        case "Delete":
        case "Backspace":
          if (selectedIds.length) {
            e.preventDefault();
            deleteSelected();
          }
          break;
        case "Escape":
          useExplorerStore.setState({ clipboard: null, contextMenu: null });
          break;
      }
    },
    [
      renamingId,
      rows,
      focusedId,
      selectedIds,
      nodes,
      rootId,
      selectAllVisible,
      copySelection,
      cutSelection,
      pasteInto,
      undo,
      moveFocus,
      arrowRight,
      arrowLeft,
      handleRowActivate,
      startRename,
      deleteSelected,
    ]
  );

  const rowProps: TreeRowSharedProps = useMemo(
    () => ({
      rows,
      nodes,
      expanded,
      selectedIds,
      focusedId,
      activeFileId,
      renamingId,
      clipboard,
      pinnedIds,
      errorFileIds,
      compiledFileIds,
      view,
      dragIds,
      dropTargetId,
      dropPosition,
      searchActive,
      onRowClick: handleRowClick,
      onRowActivate: handleRowActivate,
      onToggleExpand: toggleExpand,
      onContextMenu: handleRowContextMenu,
      onRenameCommit: commitRename,
      onRenameCancel: cancelRename,
      onDragStartRow: handleDragStartRow,
      onDragOverRow: handleDragOverRow,
      onDropRow: handleDropRow,
      onDragEndRow: handleDragEndRow,
    }),
    [
      rows,
      nodes,
      expanded,
      selectedIds,
      focusedId,
      activeFileId,
      renamingId,
      clipboard,
      pinnedIds,
      errorFileIds,
      compiledFileIds,
      view,
      dragIds,
      dropTargetId,
      dropPosition,
      searchActive,
      handleRowClick,
      handleRowActivate,
      toggleExpand,
      handleRowContextMenu,
      commitRename,
      cancelRename,
      handleDragStartRow,
      handleDragOverRow,
      handleDropRow,
      handleDragEndRow,
    ]
  );

  useEffect(() => {
    if (rootId) void ensureLoaded(rootId);
  }, [rootId, ensureLoaded]);

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="File Explorer"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={handleContainerDragOver}
      onDrop={handleContainerDrop}
      onContextMenu={(e) => {
        if (e.target === containerRef.current) {
          e.preventDefault();
          openContextMenu(e.clientX, e.clientY, null);
        }
      }}
      className="relative min-h-0 flex-1 outline-none"
    >
      {rows.length === 0 ? (
        <EmptyState searching={searchActive} rootId={rootId} />
      ) : (
        <List
          listRef={listRef}
          rowComponent={TreeRow}
          rowCount={rows.length}
          rowHeight={ROW_HEIGHT}
          rowProps={rowProps}
          overscanCount={12}
          className="scrollbar-thin"
          style={{ height: "100%", width: "100%" }}
          onRowsRendered={(visible) => setScrollOffset(visible.startIndex * ROW_HEIGHT)}
        />
      )}
      <ContextMenu />
      <PropertiesDialog />
    </div>
  );
}

function EmptyState({ searching, rootId }: { searching: boolean; rootId: string }) {
  const createFile = useExplorerStore((s) => s.createFile);
  const createFolder = useExplorerStore((s) => s.createFolder);
  const uploadFiles = useExplorerStore((s) => s.uploadFiles);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  if (searching) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconSearch className="h-9 w-9 text-border-subtle" />
        <p className="text-xs text-text-muted">No files match your search.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <IconFilesActivity className="h-9 w-9 text-border-subtle" />
      <p className="text-xs font-medium text-text-secondary">Empty Workspace</p>
      <div className="flex flex-col gap-1.5">
        <EmptyStateAction icon={IconNewFile} label="New File" onClick={() => createFile(rootId)} />
        <EmptyStateAction icon={IconNewFolder} label="New Folder" onClick={() => createFolder(rootId)} />
        <EmptyStateAction icon={IconUpload} label="Upload Files" onClick={() => uploadInputRef.current?.click()} />
      </div>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) void uploadFiles(e.target.files, rootId);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function EmptyStateAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: (props: { className?: string }) => React.ReactElement;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-44 items-center gap-2 rounded-md border border-panel-border bg-surface-1 px-2.5 py-1.5 text-left text-xs text-text-primary transition-colors duration-200 hover:border-accent/50 hover:bg-surface-hover"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      {label}
    </button>
  );
}
