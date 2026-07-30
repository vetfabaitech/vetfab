"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { RowComponentProps } from "react-window";
import { ClipboardState, FlatRow, GitStatus, TreeNode, ViewOptions } from "@/types/explorer";
import { basenameWithoutExt, formatBytes, formatDate } from "@/utils/format";
import { IconChevronRight } from "@/components/icons";
import FileIcon from "./FileIcon";
import FileStatusBadge from "./FileStatusBadge";
import { IconLock, IconPin } from "./icons";

const GIT_COLORS: Record<NonNullable<GitStatus>, string> = {
  modified: "#e2b93d",
  added: "#4ade80",
  deleted: "#f87171",
  untracked: "#4ade80",
  ignored: "#6b7280",
};

const ROW_INDENT_PX = 6;
const ROW_INDENT_STEP_PX = 16;

const ICON_SIZE_MAP = {
  small: "small",
  medium: "medium",
  large: "large",
} as const;

export interface TreeRowSharedProps {
  rows: FlatRow[];
  nodes: Record<string, TreeNode>;
  expanded: Record<string, boolean>;
  selectedIds: string[];
  focusedId: string | null;
  activeFileId: string | null;
  renamingId: string | null;
  clipboard: ClipboardState | null;
  pinnedIds: string[];
  errorFileIds: Set<string>;
  compiledFileIds: Set<string>;
  view: ViewOptions;
  dragIds: string[];
  dropTargetId: string | null;
  dropPosition: "before" | "after" | "inside" | null;
  searchActive: boolean;
  onRowClick: (row: FlatRow, e: React.MouseEvent) => void;
  onRowActivate: (row: FlatRow) => void;
  onToggleExpand: (id: string) => void;
  onContextMenu: (row: FlatRow, e: React.MouseEvent) => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onDragStartRow: (row: FlatRow, e: React.DragEvent) => void;
  onDragOverRow: (row: FlatRow, e: React.DragEvent) => void;
  onDropRow: (row: FlatRow, e: React.DragEvent) => void;
  onDragEndRow: () => void;
}

type TreeRowProps = RowComponentProps<TreeRowSharedProps>;

export default function TreeRow(props: TreeRowProps) {
  const {
    index,
    style,
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
    onRowClick,
    onRowActivate,
    onToggleExpand,
    onContextMenu,
    onRenameCommit,
    onRenameCancel,
    onDragStartRow,
    onDragOverRow,
    onDropRow,
    onDragEndRow,
  } = props;

  const row = rows[index];
  const inputRef = useRef<HTMLInputElement>(null);

  const isRenaming = row && renamingId === row.id;

  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming]);

  if (!row) return null;

  if (row.skeleton) {
    return (
      <div style={{ ...style, paddingLeft: 8 + row.depth * 14 }} className="flex items-center gap-2 pr-2">
        <div className="h-3.5 w-3.5 animate-pulse rounded bg-border-subtle/50" />
        <div className="h-3 w-full max-w-[60%] animate-pulse rounded bg-border-subtle/40" />
      </div>
    );
  }

  const node = nodes[row.id];
  if (!node) return null;

  const isSelected = selectedIds.includes(row.id);
  const isFocused = focusedId === row.id;
  const isActive = activeFileId === row.id;
  const isExpanded = row.kind === "folder" && !!expanded[row.id];
  const isCut = clipboard?.mode === "cut" && clipboard.ids.includes(row.id);
  const isPinned = pinnedIds.includes(row.id);
  const isDragging = dragIds.includes(row.id);
  const isDropTarget = dropTargetId === row.id;

  const gitStatus = "gitStatus" in node ? node.gitStatus : null;
  const displayLabel =
    !searchActive && row.kind === "file" && !view.showExtensions
      ? basenameWithoutExt(row.label)
      : row.label;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onRenameCommit(inputRef.current?.value ?? "");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onRenameCancel();
    }
    e.stopPropagation();
  };

  return (
    <div
      style={style}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={row.kind === "folder" ? isExpanded : undefined}
      draggable={!isRenaming}
      onDragStart={(e) => onDragStartRow(row, e)}
      onDragOver={(e) => onDragOverRow(row, e)}
      onDrop={(e) => onDropRow(row, e)}
      onDragEnd={onDragEndRow}
      onClick={(e) => onRowClick(row, e)}
      onDoubleClick={() => onRowActivate(row)}
      onContextMenu={(e) => onContextMenu(row, e)}
      className={`group relative flex cursor-default items-center gap-1 rounded-md pr-2 text-[14px] transition-colors duration-150 ${
        isActive
          ? "bg-surface-selected text-text-primary"
          : isSelected
            ? "bg-surface-hover text-text-primary"
            : "text-text-secondary hover:bg-surface-hover"
      } ${isFocused ? "outline outline-1 -outline-offset-1 outline-accent/70" : ""} ${
        isDragging ? "opacity-40" : ""
      } ${isCut ? "opacity-50" : ""} ${
        isDropTarget && dropPosition === "inside" ? "bg-accent/15 ring-1 ring-inset ring-accent/60" : ""
      } ${isActive ? "border-l-2 border-accent" : "border-l-2 border-transparent"}`}
    >
      <div
        style={{ paddingLeft: ROW_INDENT_PX + row.depth * ROW_INDENT_STEP_PX }}
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        {row.kind === "folder" ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(row.id);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted hover:text-text-primary"
          >
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.12 }}
              className="flex"
            >
              <IconChevronRight className="h-3.5 w-3.5" />
            </motion.span>
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <FileIcon
          name={row.label}
          kind={row.kind}
          isOpen={isExpanded}
          isRoot={false}
          iconSize={ICON_SIZE_MAP[view.iconSize]}
          className="shrink-0"
        />

        {isRenaming ? (
          <input
            key={row.id}
            ref={inputRef}
            defaultValue={row.label}
            onKeyDown={handleKeyDown}
            onBlur={() => onRenameCommit(inputRef.current?.value ?? "")}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded-sm border border-accent bg-terminal-bg px-1 text-[14px] text-text-primary outline-none"
          />
        ) : (
          <span
            className={`truncate ${gitStatus === "deleted" ? "line-through" : ""} ${
              node.kind === "file" && node.readOnly ? "italic" : ""
            } ${isActive ? "font-semibold text-text-primary" : ""}`}
            style={gitStatus ? { color: GIT_COLORS[gitStatus] } : undefined}
            title={row.label}
          >
            {renderLabel(displayLabel, row.matchRanges)}
          </span>
        )}

        {node.kind === "file" && (
          <FileStatusBadge
            hasError={errorFileIds.has(node.id)}
            dirty={!!node.dirty}
            compiled={compiledFileIds.has(node.id)}
          />
        )}
        {node.kind === "file" && node.locked && <IconLock className="h-3 w-3 shrink-0 text-text-muted" />}
        {isPinned && <IconPin className="h-3 w-3 shrink-0 text-accent" />}

        <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-[10px] text-text-muted">
          {view.showFileSize && node.kind === "file" && <span>{formatBytes(node.size)}</span>}
          {view.showModifiedDate && <span>{formatDate(node.modifiedAt)}</span>}
        </span>
      </div>

      {isDropTarget && dropPosition === "before" && (
        <div className="pointer-events-none absolute inset-x-2 top-0 h-0.5 -translate-y-px rounded bg-accent" />
      )}
      {isDropTarget && dropPosition === "after" && (
        <div className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 translate-y-px rounded bg-accent" />
      )}
    </div>
  );
}

function renderLabel(label: string, ranges?: [number, number][]) {
  if (!ranges || ranges.length === 0) return label;
  const [start, end] = ranges[0];
  return (
    <>
      {label.slice(0, start)}
      <mark className="rounded-sm bg-accent/30 text-inherit">{label.slice(start, end)}</mark>
      {label.slice(end)}
    </>
  );
}
