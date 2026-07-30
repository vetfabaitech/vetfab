"use client";

import { useExplorerStore } from "@/store/explorerStore";
import { getPathSegments } from "@/utils/treeUtils";
import FileIcon from "./FileIcon";

export default function Breadcrumb() {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const focusedId = useExplorerStore((s) => s.focusedId);
  const activeFileId = useExplorerStore((s) => s.activeFileId);
  const reveal = useExplorerStore((s) => s.reveal);

  const targetId = focusedId ?? activeFileId;
  if (!targetId || !nodes[targetId]) {
    return (
      <div className="flex h-6 shrink-0 items-center border-b border-panel-border px-3 text-[11px] text-text-muted">
        No selection
      </div>
    );
  }

  const segments = getPathSegments(targetId, nodes).filter((s) => s.id !== rootId);

  return (
    <div className="scrollbar-thin flex h-6 shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-panel-border px-2 text-[11px] text-text-muted">
      {segments.map((seg, i) => (
        <span key={seg.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-border-subtle">/</span>}
          <button
            type="button"
            onClick={() => reveal(seg.id)}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-hover hover:text-text-primary"
          >
            <FileIcon name={seg.name} kind={seg.kind} iconSize="small" />
            {seg.name}
          </button>
        </span>
      ))}
    </div>
  );
}
