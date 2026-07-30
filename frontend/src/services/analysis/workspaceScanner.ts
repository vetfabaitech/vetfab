import { FileNodeData, FolderNodeData, TreeNode } from "@/types/explorer";

export interface ScannedFileEntry {
  id: string;
  name: string;
  relativePath: string;
  depth: number;
  node: FileNodeData;
}

export interface ScannedFolderEntry {
  id: string;
  name: string;
  relativePath: string;
  depth: number;
  node: FolderNodeData;
}

export interface ScanResult {
  files: ScannedFileEntry[];
  folders: ScannedFolderEntry[];
}

/** Walks the current in-memory workspace tree (whatever the explorer has loaded)
 * into flat, relative-path-addressed file/folder lists. Folders never expanded
 * in the explorer simply won't be visited -- analysis only sees what's been read. */
export function scanWorkspace(nodes: Record<string, TreeNode>, rootId: string): ScanResult {
  const files: ScannedFileEntry[] = [];
  const folders: ScannedFolderEntry[] = [];

  function walk(id: string, relativePath: string, depth: number) {
    const node = nodes[id];
    if (!node) return;

    if (node.kind === "folder") {
      if (id !== rootId) {
        folders.push({ id, name: node.name, relativePath, depth, node });
      }
      for (const childId of node.children) {
        const child = nodes[childId];
        if (!child) continue;
        const childPath = relativePath ? `${relativePath}/${child.name}` : child.name;
        walk(childId, childPath, depth + 1);
      }
    } else {
      files.push({ id, name: node.name, relativePath, depth, node });
    }
  }

  walk(rootId, "", 0);
  return { files, folders };
}
