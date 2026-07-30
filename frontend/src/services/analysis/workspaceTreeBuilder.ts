import { ScannedFileEntry, ScannedFolderEntry } from "./workspaceScanner";
import { WorkspaceTreeNode } from "./types";

type FolderNode = Extract<WorkspaceTreeNode, { kind: "folder" }>;

function parentPathOf(relativePath: string): string {
  const idx = relativePath.lastIndexOf("/");
  return idx === -1 ? "" : relativePath.slice(0, idx);
}

/** Reassembles the flat scan results into a nested tree preserving folder
 * hierarchy and relative paths. Deliberately minimal per the payload schema --
 * files carry only {id, name, path}; every other property (extension, size,
 * category, content, ...) lives exclusively in the `files` dictionary so
 * nothing is duplicated between `workspace.tree` and `files`. */
export function buildWorkspaceTree(
  workspaceName: string,
  files: ScannedFileEntry[],
  folders: ScannedFolderEntry[],
  pathToFileId: Map<string, string>
): WorkspaceTreeNode {
  const root: FolderNode = { kind: "folder", name: workspaceName, path: "", children: [] };
  const folderNodes = new Map<string, FolderNode>();
  folderNodes.set("", root);

  const sortedFolders = [...folders].sort((a, b) => a.depth - b.depth);
  for (const folder of sortedFolders) {
    const parent = folderNodes.get(parentPathOf(folder.relativePath)) ?? root;
    const node: FolderNode = { kind: "folder", name: folder.name, path: folder.relativePath, children: [] };
    parent.children.push(node);
    folderNodes.set(folder.relativePath, node);
  }

  for (const file of files) {
    const fileId = pathToFileId.get(file.relativePath);
    if (!fileId) continue;
    const parent = folderNodes.get(parentPathOf(file.relativePath)) ?? root;
    parent.children.push({ kind: "file", id: fileId, name: file.name, path: file.relativePath });
  }

  return root;
}
