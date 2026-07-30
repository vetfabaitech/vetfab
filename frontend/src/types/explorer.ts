export type NodeKind = "file" | "folder";

export type GitStatus = "modified" | "added" | "deleted" | "ignored" | "untracked" | null;

interface BaseNode {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  modifiedAt: number;
}

export interface FileNodeData extends BaseNode {
  kind: "file";
  size: number;
  content?: string;
  readOnly?: boolean;
  locked?: boolean;
  dirty?: boolean;
  gitStatus?: GitStatus;
}

export interface FolderNodeData extends BaseNode {
  kind: "folder";
  children: string[];
  childrenLoaded: boolean;
  gitStatus?: GitStatus;
}

export type TreeNode = FileNodeData | FolderNodeData;

export type SortField = "name" | "type" | "extension" | "modified" | "created" | "size";
export type SortDirection = "asc" | "desc";
export type FolderPosition = "first" | "last" | "none";

export interface SortOptions {
  field: SortField;
  direction: SortDirection;
  folderPosition: FolderPosition;
}

export type IconSize = "small" | "medium" | "large";

export interface ViewOptions {
  showHiddenFiles: boolean;
  compactFolders: boolean;
  iconSize: IconSize;
  showExtensions: boolean;
  showModifiedDate: boolean;
  showFileSize: boolean;
}

export type ActivityView = "explorer" | "search" | "scm";

export interface ClipboardState {
  ids: string[];
  mode: "copy" | "cut";
}

export type DropPosition = "before" | "after" | "inside";

export interface FlatRow {
  id: string;
  depth: number;
  kind: NodeKind;
  label: string;
  compactedIds: string[];
  matchRanges?: [number, number][];
  skeleton?: boolean;
}

export interface UndoEntry {
  kind: "delete" | "rename" | "move";
  describe: string;
  apply: () => void;
}
