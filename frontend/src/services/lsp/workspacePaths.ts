import type { FolderNodeData, TreeNode } from "@/types/explorer";
import { getPathSegments } from "@/utils/treeUtils";

/** Workspace-relative path for a file node (e.g. "rtl/adder.sv"), excluding
 * the synthetic workspace-root segment -- same derivation
 * `explorerStore.copyRelativePath` uses for the user-facing "Copy Relative
 * Path" action. Returns null for the root node itself or an unknown id. */
export function relativePathFor(fileId: string, nodes: Record<string, TreeNode>): string | null {
  const segments = getPathSegments(fileId, nodes).slice(1);
  if (segments.length === 0) return null;
  return segments.map((s) => s.name).join("/");
}

/** Reverse of `relativePathFor`: walks the current explorer tree from
 * `rootId`, matching each `/`-separated path segment by name, and returns
 * the matching file node's id -- or null if no file in the current tree
 * matches (e.g. a stale LSP response after a rename/delete). Used to
 * resolve an LSP definition/reference Location (which only carries a
 * `file://` URI, see `lspConnection.ts`'s `relativePathForLspUri`) back to
 * the tab system's opaque file id -- see `services/lsp/lspNavigation.ts`. */
export function fileIdForRelativePath(
  relativePath: string,
  nodes: Record<string, TreeNode>,
  rootId: string
): string | null {
  const segments = relativePath.split("/").filter(Boolean);
  const rootNode = nodes[rootId];
  if (!rootNode || rootNode.kind !== "folder") return null;

  let current: FolderNodeData = rootNode;
  for (let i = 0; i < segments.length; i++) {
    const childId: string | undefined = current.children.find((cid) => nodes[cid]?.name === segments[i]);
    const child: TreeNode | undefined = childId !== undefined ? nodes[childId] : undefined;
    if (!child) return null;
    if (i === segments.length - 1) return child.kind === "file" ? child.id : null;
    if (child.kind !== "folder") return null;
    current = child;
  }
  return null;
}

/** Every file in the tree as `{ path, content }`, matching the backend's
 * `WorkspaceFile` schema (`app/schemas/workspace.py`) -- the same shape
 * `flattenTreeForTerminal` produces for the terminal's `init` payload, just
 * keyed `path` instead of `name` to match `/workspace/*` and `/lint`. */
export function flattenWorkspaceFiles(
  nodes: Record<string, TreeNode>,
  rootId: string
): { path: string; content: string }[] {
  const root = nodes[rootId] as FolderNodeData | undefined;
  if (!root) return [];
  const out: { path: string; content: string }[] = [];
  const walk = (id: string, prefix: string) => {
    const node = nodes[id];
    if (!node) return;
    if (node.kind === "file") {
      out.push({ path: prefix + node.name, content: node.content ?? "" });
    } else {
      node.children.forEach((cid) => walk(cid, `${prefix}${node.name}/`));
    }
  };
  root.children.forEach((cid) => walk(cid, ""));
  return out;
}
