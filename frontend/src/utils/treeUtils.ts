import { FlatRow, FolderNodeData, SortOptions, TreeNode, ViewOptions } from "@/types/explorer";
import { extname } from "./format";

export function getNodeSize(id: string, nodes: Record<string, TreeNode>): number {
  const node = nodes[id];
  if (!node) return 0;
  if (node.kind === "file") return node.size;
  return node.children.reduce((sum, cid) => sum + getNodeSize(cid, nodes), 0);
}

export function sortChildren(ids: string[], nodes: Record<string, TreeNode>, sort: SortOptions): string[] {
  const arr = ids.filter((id) => nodes[id]);
  arr.sort((aId, bId) => {
    const a = nodes[aId];
    const b = nodes[bId];
    if (sort.folderPosition !== "none" && a.kind !== b.kind) {
      const aIsFolder = a.kind === "folder";
      if (sort.folderPosition === "first") return aIsFolder ? -1 : 1;
      return aIsFolder ? 1 : -1;
    }
    let cmp = 0;
    switch (sort.field) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        break;
      case "type":
        cmp = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
        break;
      case "extension":
        cmp = extname(a.name).localeCompare(extname(b.name)) || a.name.localeCompare(b.name);
        break;
      case "modified":
        cmp = a.modifiedAt - b.modifiedAt;
        break;
      case "created":
        cmp = a.createdAt - b.createdAt;
        break;
      case "size":
        cmp = getNodeSize(aId, nodes) - getNodeSize(bId, nodes);
        break;
    }
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return arr;
}

interface FlattenParams {
  nodes: Record<string, TreeNode>;
  rootId: string;
  expanded: Record<string, boolean>;
  loadingIds: Record<string, boolean>;
  sort: SortOptions;
  view: ViewOptions;
}

function visible(node: TreeNode, view: ViewOptions): boolean {
  return view.showHiddenFiles || !node.name.startsWith(".");
}

export function flattenTree({ nodes, rootId, expanded, loadingIds, sort, view }: FlattenParams): FlatRow[] {
  const rows: FlatRow[] = [];

  function visit(folderId: string, depth: number) {
    const folderNode = nodes[folderId] as FolderNodeData | undefined;
    if (!folderNode) return;
    const childIds = sortChildren(
      folderNode.children.filter((id) => nodes[id] && visible(nodes[id], view)),
      nodes,
      sort
    );

    for (const id of childIds) {
      const node = nodes[id];
      if (node.kind === "folder") {
        const chain = [node.id];
        let chainNode = node as FolderNodeData;
        if (view.compactFolders) {
          while (chainNode.children.length === 1) {
            const onlyChild = nodes[chainNode.children[0]];
            if (!onlyChild || onlyChild.kind !== "folder" || !visible(onlyChild, view)) break;
            chain.push(onlyChild.id);
            chainNode = onlyChild as FolderNodeData;
          }
        }
        const endId = chain[chain.length - 1];
        const label = chain.map((cid) => nodes[cid].name).join("/");
        rows.push({ id: endId, depth, kind: "folder", label, compactedIds: chain });

        if (expanded[endId]) {
          if (!chainNode.childrenLoaded) {
            if (loadingIds[endId]) {
              rows.push({
                id: `${endId}::skeleton`,
                depth: depth + 1,
                kind: "file",
                label: "",
                compactedIds: [],
                skeleton: true,
              });
            }
          } else {
            visit(endId, depth + 1);
          }
        }
      } else {
        rows.push({ id: node.id, depth, kind: "file", label: node.name, compactedIds: [node.id] });
      }
    }
  }

  visit(rootId, 0);
  return rows;
}

function matchRange(name: string, query: string, isExt: boolean): [number, number] | null {
  if (isExt) {
    return extname(name) === query.toLowerCase() ? [0, name.length] : null;
  }
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  return [idx, idx + query.length];
}

export function flattenSearch(
  nodes: Record<string, TreeNode>,
  rootId: string,
  sort: SortOptions,
  view: ViewOptions,
  query: string
): FlatRow[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const isExt = trimmed.startsWith(".") || trimmed.startsWith("*.");
  const needle = isExt ? trimmed.replace(/^\*?\./, "") : trimmed;

  function visit(id: string, depth: number): FlatRow[] | null {
    const node = nodes[id];
    if (!node || !visible(node, view)) return null;

    if (node.kind === "file") {
      const range = matchRange(node.name, needle, isExt);
      if (!range) return null;
      return [{ id: node.id, depth, kind: "file", label: node.name, compactedIds: [node.id], matchRanges: [range] }];
    }

    const selfRange = matchRange(node.name, needle, isExt);
    const childIds = sortChildren(node.children, nodes, sort);
    const collected: FlatRow[] = [];
    for (const cid of childIds) {
      const r = visit(cid, depth + 1);
      if (r) collected.push(...r);
    }
    if (!selfRange && collected.length === 0) return null;
    return [
      {
        id: node.id,
        depth,
        kind: "folder",
        label: node.name,
        compactedIds: [node.id],
        matchRanges: selfRange ? [selfRange] : undefined,
      },
      ...collected,
    ];
  }

  const root = nodes[rootId] as FolderNodeData;
  const rows: FlatRow[] = [];
  const childIds = sortChildren(root.children, nodes, sort);
  for (const cid of childIds) {
    const r = visit(cid, 0);
    if (r) rows.push(...r);
  }
  return rows;
}

export function getAncestorIds(id: string, nodes: Record<string, TreeNode>): string[] {
  const ancestors: string[] = [];
  let current = nodes[id];
  while (current && current.parentId) {
    ancestors.push(current.parentId);
    current = nodes[current.parentId];
  }
  return ancestors;
}

export function getPathSegments(id: string, nodes: Record<string, TreeNode>): TreeNode[] {
  const segments: TreeNode[] = [];
  let current = nodes[id];
  while (current) {
    segments.unshift(current);
    current = current.parentId ? nodes[current.parentId] : undefined as unknown as TreeNode;
  }
  return segments;
}

export function getDescendantIds(id: string, nodes: Record<string, TreeNode>): string[] {
  const node = nodes[id];
  if (!node || node.kind !== "folder") return [];
  const out: string[] = [];
  const stack = [...node.children];
  while (stack.length) {
    const cur = stack.pop() as string;
    out.push(cur);
    const curNode = nodes[cur];
    if (curNode?.kind === "folder") stack.push(...curNode.children);
  }
  return out;
}

export function isDescendantOf(candidateId: string, ancestorId: string, nodes: Record<string, TreeNode>): boolean {
  let current = nodes[candidateId];
  while (current && current.parentId) {
    if (current.parentId === ancestorId) return true;
    current = nodes[current.parentId];
  }
  return false;
}
