"use client";

import { useExplorerStore } from "@/store/explorerStore";
import { getNodeSize, getPathSegments } from "@/utils/treeUtils";
import { formatBytes, formatDate, extname } from "@/utils/format";
import { IconClose } from "@/components/icons";
import FileIcon from "./FileIcon";

export default function PropertiesDialog() {
  const propertiesTargetId = useExplorerStore((s) => s.propertiesTargetId);
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const closeProperties = useExplorerStore((s) => s.closeProperties);

  if (!propertiesTargetId) return null;
  const node = nodes[propertiesTargetId];
  if (!node) return null;

  const segments = getPathSegments(propertiesTargetId, nodes).filter((s) => s.id !== rootId);
  const path = "/" + segments.map((s) => s.name).join("/");
  const size = getNodeSize(propertiesTargetId, nodes);
  const childCount = node.kind === "folder" ? node.children.length : null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
      onClick={closeProperties}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Properties"
        className="w-80 overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="flex items-center justify-between border-b border-panel-border px-4 py-2.5">
          <h2 className="text-sm font-semibold text-text-primary">Properties</h2>
          <button
            type="button"
            onClick={closeProperties}
            aria-label="Close"
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 pt-4">
          <FileIcon name={node.name} kind={node.kind} iconSize="large" />
          <span className="truncate text-sm font-medium text-text-primary">{node.name}</span>
        </div>

        <dl className="grid grid-cols-[100px_1fr] gap-y-2 px-4 py-4 text-xs">
          <Row label="Type" value={node.kind === "folder" ? "Folder" : `File (.${extname(node.name) || "—"})`} />
          <Row label="Path" value={path} mono />
          <Row label="Size" value={formatBytes(size)} />
          {childCount !== null && <Row label="Items" value={String(childCount)} />}
          <Row label="Created" value={formatDate(node.createdAt)} />
          <Row label="Modified" value={formatDate(node.modifiedAt)} />
          {node.kind === "file" && (
            <Row
              label="Attributes"
              value={[node.readOnly && "Read-only", node.locked && "Locked", node.dirty && "Unsaved"].filter(Boolean).join(", ") || "None"}
            />
          )}
          {node.gitStatus && <Row label="Git Status" value={node.gitStatus} />}
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className={`truncate text-text-primary ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </dd>
    </>
  );
}
