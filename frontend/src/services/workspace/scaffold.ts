import { FolderNodeData, TreeNode } from "@/types/explorer";
import { makeFileNode, makeFolderNode } from "@/services/mockFileSystem";

/** One file to place in a generated project scaffold -- `folder: ""` means
 * "directly under the project root" (e.g. README.md). */
export interface ScaffoldFile {
  folder: "src" | "tb" | "constraints" | "docs" | "";
  name: string;
  content: string;
}

export interface ScaffoldResult {
  nodes: Record<string, TreeNode>;
  rootId: string;
  /** The first file placed under `src/`, if any -- what a caller should
   * open immediately after scaffolding. */
  primaryFileId: string | null;
}

const SCAFFOLD_FOLDERS = ["src", "tb", "constraints", "docs"] as const;

/** Builds a `project_name/{src,tb,constraints,docs}/` tree (all four
 * folders always created, even if empty) and places each `files` entry
 * under its matching folder -- the one shared structure every language
 * project template (see languageTemplates.ts) is built from, so the
 * src/tb/constraints/docs layout only exists in one place. */
export function buildProjectScaffold(projectName: string, files: ScaffoldFile[]): ScaffoldResult {
  const nodes: Record<string, TreeNode> = {};
  const add = (node: TreeNode) => {
    nodes[node.id] = node;
    return node.id;
  };

  const root = makeFolderNode(null, projectName, { id: "root", children: [] }) as FolderNodeData;
  add(root);

  const folderIdByName: Record<(typeof SCAFFOLD_FOLDERS)[number], string> = {} as never;
  for (const name of SCAFFOLD_FOLDERS) {
    const folder = makeFolderNode(root.id, name, { children: [] }) as FolderNodeData;
    folderIdByName[name] = add(folder);
    root.children.push(folder.id);
  }

  let primaryFileId: string | null = null;

  for (const spec of files) {
    const parentId = spec.folder === "" ? root.id : folderIdByName[spec.folder];
    const fileNode = makeFileNode(parentId, spec.name, { content: spec.content });
    add(fileNode);
    (nodes[parentId] as FolderNodeData).children.push(fileNode.id);

    if (spec.folder === "src" && primaryFileId === null) {
      primaryFileId = fileNode.id;
    }
  }

  return { nodes, rootId: root.id, primaryFileId };
}
