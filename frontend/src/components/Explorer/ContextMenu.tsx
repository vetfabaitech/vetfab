"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import {
  IconArchive,
  IconClipboard,
  IconCopy,
  IconDuplicate,
  IconEye,
  IconInfo,
  IconNewFile,
  IconNewFolder,
  IconScissors,
  IconUpload,
  IconUploadFolder,
} from "./icons";
import { IconDownload, IconTrash } from "@/components/icons";

interface MenuEntry {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  htmlFor?: string;
}

const UPLOAD_FILE_INPUT_ID = "explorer-ctxmenu-upload-file";
const UPLOAD_FOLDER_INPUT_ID = "explorer-ctxmenu-upload-folder";

export default function ContextMenu() {
  const contextMenu = useExplorerStore((s) => s.contextMenu);
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const selectedIds = useExplorerStore((s) => s.selectedIds);
  const clipboard = useExplorerStore((s) => s.clipboard);

  const closeContextMenu = useExplorerStore((s) => s.closeContextMenu);
  const createFile = useExplorerStore((s) => s.createFile);
  const createFolder = useExplorerStore((s) => s.createFolder);
  const startRename = useExplorerStore((s) => s.startRename);
  const duplicateNode = useExplorerStore((s) => s.duplicateNode);
  const copySelection = useExplorerStore((s) => s.copySelection);
  const cutSelection = useExplorerStore((s) => s.cutSelection);
  const pasteInto = useExplorerStore((s) => s.pasteInto);
  const deleteSelected = useExplorerStore((s) => s.deleteSelected);
  const downloadFile = useExplorerStore((s) => s.downloadFile);
  const downloadFolder = useExplorerStore((s) => s.downloadFolder);
  const copyPath = useExplorerStore((s) => s.copyPath);
  const copyRelativePath = useExplorerStore((s) => s.copyRelativePath);
  const openFile = useExplorerStore((s) => s.openFile);
  const reveal = useExplorerStore((s) => s.reveal);
  const openProperties = useExplorerStore((s) => s.openProperties);
  const setExpandedMany = useExplorerStore((s) => s.setExpandedMany);
  const selectSingle = useExplorerStore((s) => s.selectSingle);
  const uploadFiles = useExplorerStore((s) => s.uploadFiles);
  const openEditorTab = useEditorStore((s) => s.openFile);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!contextMenu?.targetId) return;
    const state = useExplorerStore.getState();
    if (!state.selectedIds.includes(contextMenu.targetId)) {
      selectSingle(contextMenu.targetId);
    }
  }, [contextMenu, selectSingle]);

  useLayoutEffect(() => {
    if (!contextMenu || !ref.current) {
      setPos(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(contextMenu.x, window.innerWidth - rect.width - 8);
    const y = Math.min(contextMenu.y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(4, x), y: Math.max(4, y) });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => closeContextMenu();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    // Clicking anywhere outside the menu closes it -- a menu-item click still
    // works normally (its own onClick fires and calls closeContextMenu via
    // `run`) since that mousedown target is inside `ref.current`. Attached
    // after this same right-click's own mousedown has already fired (this
    // effect only runs once React commits the menu open), so it can't
    // immediately close the menu it just opened.
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const targetId = contextMenu.targetId;
  const node = targetId ? nodes[targetId] : null;
  const isMultiple = selectedIds.length > 1 && targetId !== null && selectedIds.includes(targetId);
  const uploadTargetId = node?.kind === "folder" ? node.id : rootId;

  const run = (fn: () => void) => () => {
    fn();
    closeContextMenu();
  };

  let entries: MenuEntry[] = [];

  if (!node) {
    entries = [
      { label: "New File", icon: <IconNewFile className="h-4 w-4" />, onClick: run(() => createFile(rootId)) },
      { label: "New Folder", icon: <IconNewFolder className="h-4 w-4" />, onClick: run(() => createFolder(rootId)) },
      { label: "Upload File…", icon: <IconUpload className="h-4 w-4" />, htmlFor: UPLOAD_FILE_INPUT_ID, onClick: closeContextMenu },
      { label: "Upload Folder…", icon: <IconUploadFolder className="h-4 w-4" />, htmlFor: UPLOAD_FOLDER_INPUT_ID, onClick: closeContextMenu },
      ...(clipboard
        ? [{ label: "Paste", icon: <IconClipboard className="h-4 w-4" />, onClick: run(() => pasteInto(rootId)) }]
        : []),
    ];
  } else if (node.kind === "folder") {
    entries = [
      { label: "New File", icon: <IconNewFile className="h-4 w-4" />, onClick: run(() => createFile(node.id)) },
      { label: "New Folder", icon: <IconNewFolder className="h-4 w-4" />, onClick: run(() => createFolder(node.id)) },
      { label: "Upload File…", icon: <IconUpload className="h-4 w-4" />, htmlFor: UPLOAD_FILE_INPUT_ID, onClick: closeContextMenu },
      { label: "Upload Folder…", icon: <IconUploadFolder className="h-4 w-4" />, htmlFor: UPLOAD_FOLDER_INPUT_ID, onClick: closeContextMenu },
      ...(!isMultiple ? [{ label: "Rename", onClick: run(() => startRename(node.id)) }] : []),
      { label: "Duplicate", icon: <IconDuplicate className="h-4 w-4" />, onClick: run(() => duplicateNode(node.id)) },
      { label: "Copy", icon: <IconCopy className="h-4 w-4" />, onClick: run(copySelection) },
      { label: "Cut", icon: <IconScissors className="h-4 w-4" />, onClick: run(cutSelection) },
      ...(clipboard
        ? [{ label: "Paste", icon: <IconClipboard className="h-4 w-4" />, onClick: run(() => pasteInto(node.id)) }]
        : []),
      { label: "Delete", icon: <IconTrash className="h-4 w-4" />, onClick: run(deleteSelected), danger: true },
      { label: "Download Folder (.zip)", icon: <IconArchive className="h-4 w-4" />, onClick: run(() => void downloadFolder(node.id)) },
      { label: "Expand", onClick: run(() => setExpandedMany([node.id], true)) },
      { label: "Collapse", onClick: run(() => setExpandedMany([node.id], false)) },
      { label: "Reveal in Explorer", icon: <IconEye className="h-4 w-4" />, onClick: run(() => reveal(node.id)) },
      { label: "Properties", icon: <IconInfo className="h-4 w-4" />, onClick: run(() => openProperties(node.id)) },
    ];
  } else {
    entries = [
      {
        label: "Open",
        onClick: run(() => {
          openFile(node.id);
          openEditorTab(node.id);
        }),
      },
      {
        label: "Open in New Tab",
        onClick: run(() => {
          openFile(node.id);
          openEditorTab(node.id, { pin: true });
        }),
      },
      ...(!isMultiple ? [{ label: "Rename", onClick: run(() => startRename(node.id)) }] : []),
      { label: "Duplicate", icon: <IconDuplicate className="h-4 w-4" />, onClick: run(() => duplicateNode(node.id)) },
      { label: "Copy", icon: <IconCopy className="h-4 w-4" />, onClick: run(copySelection) },
      { label: "Cut", icon: <IconScissors className="h-4 w-4" />, onClick: run(cutSelection) },
      ...(clipboard && node.parentId
        ? [{ label: "Paste", icon: <IconClipboard className="h-4 w-4" />, onClick: run(() => pasteInto(node.parentId as string)) }]
        : []),
      { label: "Delete", icon: <IconTrash className="h-4 w-4" />, onClick: run(deleteSelected), danger: true },
      { label: "Download", icon: <IconDownload className="h-4 w-4" />, onClick: run(() => downloadFile(node.id)) },
      { label: "Reveal in Explorer", icon: <IconEye className="h-4 w-4" />, onClick: run(() => reveal(node.id)) },
      ...(!isMultiple
        ? [
            { label: "Copy Path", onClick: run(() => copyPath(node.id)) },
            { label: "Copy Relative Path", onClick: run(() => copyRelativePath(node.id)) },
          ]
        : []),
      { label: "Properties", icon: <IconInfo className="h-4 w-4" />, onClick: run(() => openProperties(node.id)) },
    ];
  }

  return (
    <>
      <div
        ref={ref}
        role="menu"
        style={{ left: pos?.x ?? contextMenu.x, top: pos?.y ?? contextMenu.y, visibility: pos ? "visible" : "hidden" }}
        className="fixed z-[100] w-56 overflow-hidden rounded-md border border-panel-border bg-surface-1 py-1 shadow-elevated"
      >
        {entries.map((entry, i) => {
          const className = `flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors duration-200 ${
            entry.danger ? "text-error hover:bg-error/10" : "text-text-primary hover:bg-accent/15 hover:text-accent"
          }`;
          const content = (
            <>
              <span className="w-4 text-text-muted">{entry.icon}</span>
              {entry.label}
            </>
          );
          return entry.htmlFor ? (
            <label key={`${entry.label}-${i}`} role="menuitem" htmlFor={entry.htmlFor} onClick={entry.onClick} className={className}>
              {content}
            </label>
          ) : (
            <button key={`${entry.label}-${i}`} type="button" role="menuitem" onClick={entry.onClick} className={className}>
              {content}
            </button>
          );
        })}
      </div>

      <input
        id={UPLOAD_FILE_INPUT_ID}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files, uploadTargetId);
          e.target.value = "";
        }}
      />
      <input
        id={UPLOAD_FOLDER_INPUT_ID}
        type="file"
        className="hidden"
        // @ts-expect-error non-standard attribute for directory picking
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files, uploadTargetId);
          e.target.value = "";
        }}
      />
    </>
  );
}
