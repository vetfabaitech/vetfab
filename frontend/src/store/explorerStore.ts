import { create } from "zustand";
import { persist } from "zustand/middleware";
import JSZip from "jszip";
import {
  ActivityView,
  ClipboardState,
  FileNodeData,
  FlatRow,
  FolderNodeData,
  SortOptions,
  TreeNode,
  UndoEntry,
  ViewOptions,
} from "@/types/explorer";
import {
  buildTreeFromImported,
  delay,
  generateStressChildren,
  genId,
  ImportedFile,
  makeFileNode,
  makeFolderNode,
  readImportedFiles,
} from "@/services/mockFileSystem";
import {
  listProjects,
  loadProjectSnapshot,
  ProjectSummary,
  saveProjectSnapshot,
} from "@/services/project/persistence";
import { useEditorStore } from "@/store/editorStore";
import { getAncestorIds, getDescendantIds, getPathSegments, isDescendantOf } from "@/utils/treeUtils";
import { fileIdForRelativePath } from "@/services/lsp/workspacePaths";
import { extname, isTextExtension } from "@/utils/format";
import { buildProjectScaffold } from "@/services/workspace/scaffold";
import { buildLanguageProjectFiles, ProjectLanguage } from "@/services/workspace/languageTemplates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const DEFAULT_SORT: SortOptions = { field: "name", direction: "asc", folderPosition: "first" };
const DEFAULT_VIEW: ViewOptions = {
  showHiddenFiles: false,
  compactFolders: true,
  iconSize: "medium",
  showExtensions: true,
  showModifiedDate: false,
  showFileSize: false,
};

function uniqueName(
  nodes: Record<string, TreeNode>,
  parentId: string,
  desired: string,
  excludeId?: string
): string {
  const parent = nodes[parentId] as FolderNodeData | undefined;
  if (!parent) return desired;
  const siblingNames = new Set(
    parent.children.filter((cid) => cid !== excludeId).map((cid) => nodes[cid]?.name.toLowerCase())
  );
  if (!siblingNames.has(desired.toLowerCase())) return desired;
  const dot = desired.lastIndexOf(".");
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  let i = 2;
  while (siblingNames.has(`${base} (${i})${ext}`.toLowerCase())) i += 1;
  return `${base} (${i})${ext}`;
}

function cloneSubtree(
  id: string,
  newParentId: string,
  sourceNodes: Record<string, TreeNode>,
  out: Record<string, TreeNode>
): string {
  const node = sourceNodes[id];
  const newId = genId(node.kind === "folder" ? "d" : "f");
  if (node.kind === "file") {
    out[newId] = { ...node, id: newId, parentId: newParentId, modifiedAt: Date.now() };
  } else {
    const childIds = node.children.map((cid) => cloneSubtree(cid, newId, sourceNodes, out));
    out[newId] = { ...node, id: newId, parentId: newParentId, children: childIds, modifiedAt: Date.now() };
  }
  return newId;
}

/** Derives a Supabase-safe project id from the workspace name the first time
 * a tree is saved (so re-saving the same session updates the same row
 * instead of minting a new one each click). Not unique-guaranteed -- two
 * differently-cased/punctuated names can collide; fine for the no-auth MVP. */
function slugifyProjectId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `project-${Date.now()}`;
}

/** Shared by the manual .code-workspace.json export/import and the
 * Supabase save/refresh flow -- same wire shape either way. */
function snapshotFromState(state: {
  workspaceName: string;
  rootId: string;
  nodes: Record<string, TreeNode>;
  expanded: Record<string, boolean>;
  sort: SortOptions;
  view: ViewOptions;
  pinnedIds: string[];
  favoriteFolderIds: string[];
  sidebarWidth: number;
}) {
  return {
    version: 1,
    workspaceName: state.workspaceName,
    rootId: state.rootId,
    nodes: state.nodes,
    expanded: state.expanded,
    sort: state.sort,
    view: state.view,
    pinnedIds: state.pinnedIds,
    favoriteFolderIds: state.favoriteFolderIds,
    sidebarWidth: state.sidebarWidth,
  };
}

function stateFromSnapshot(data: Record<string, unknown> | null | undefined) {
  if (!data || !data.nodes || !data.rootId) return null;
  return {
    nodes: data.nodes as Record<string, TreeNode>,
    rootId: data.rootId as string,
    workspaceName: (data.workspaceName as string) ?? "workspace",
    expanded: (data.expanded as Record<string, boolean>) ?? {},
    sort: (data.sort as SortOptions) ?? DEFAULT_SORT,
    view: (data.view as ViewOptions) ?? DEFAULT_VIEW,
    pinnedIds: (data.pinnedIds as string[]) ?? [],
    favoriteFolderIds: (data.favoriteFolderIds as string[]) ?? [],
    sidebarWidth: (data.sidebarWidth as number) ?? 272,
    selectedIds: [] as string[],
    focusedId: null as string | null,
    activeFileId: null as string | null,
    clipboard: null as ClipboardState | null,
    undoStack: [] as UndoEntry[],
  };
}

/** Extensions the toolbar's Import button accepts -- anything else is
 * rejected up front with a friendly error rather than silently ignored. */
const IMPORT_ALLOWED_EXTENSIONS = new Set(["zip", "v", "sv", "vhd", "vh", "txt"]);

/** Priority order for "open the first HDL source file" after an import --
 * plain Verilog/SystemVerilog sources first, then VHDL, falling back to
 * whatever text file sorts first if nothing HDL-flavored was imported. */
const HDL_OPEN_PRIORITY = ["v", "sv", "vh", "vhd"];

function pickFirstHdlFile(ids: string[], nodes: Record<string, TreeNode>): string | null {
  const files = ids
    .map((id) => nodes[id])
    .filter((n): n is FileNodeData => !!n && n.kind === "file");
  for (const ext of HDL_OPEN_PRIORITY) {
    const match = files.filter((f) => extname(f.name) === ext).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (match) return match.id;
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null;
}

/** If every entry in a ZIP shares the same first path segment (the common
 * "the whole project sits inside one wrapper folder" case), returns that
 * segment so it can be stripped and used as the imported workspace's name.
 * Returns null when there's no single wrapping folder (e.g. a flat set of
 * files at the ZIP's root) -- the caller falls back to the archive's own
 * filename for the workspace name in that case. */
function findCommonZipTopFolder(paths: string[]): string | null {
  const segmentsList = paths.map((p) => p.split("/").filter(Boolean));
  if (segmentsList.length === 0 || segmentsList.some((s) => s.length < 2)) return null;
  const first = segmentsList[0][0];
  return segmentsList.every((s) => s[0] === first) ? first : null;
}

export type FocusDirection = "up" | "down" | "home" | "end" | "pageUp" | "pageDown";

interface MoveFocusOptions {
  extend?: boolean;
  pageSize?: number;
}

// A brand-new session (or one whose cached workspace just got cleared, see
// useStoresHydrated's account-switch check) starts on an empty placeholder
// rather than a populated demo project -- WorkspaceHeader's dropdown
// ("Open Folder…" / Cloud Projects list) is the actual landing action, not
// a fake pre-loaded tree that looks like real, already-saved work.
const emptyRoot = makeFolderNode(null, "No Project Open", { id: "root", children: [] });
const emptyTree: Record<string, TreeNode> = { [emptyRoot.id]: emptyRoot };

/** Guards `openCloudProject` against overlapping calls -- e.g. quick
 * successive clicks on two different cloud projects. Without this, whichever
 * request's network round trip happens to resolve *last* wins, which is not
 * necessarily the one the user most recently asked for. Module-level (not
 * store state) since it's pure bookkeeping, not UI. */
let openProjectRequestId = 0;

interface ExplorerStore {
  nodes: Record<string, TreeNode>;
  rootId: string;
  workspaceName: string;
  recentWorkspaces: { name: string; savedAt: number }[];

  expanded: Record<string, boolean>;
  loadingIds: Record<string, boolean>;
  isRefreshing: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  syncError: string | null;
  /** The Supabase project id this tree is linked to, or null if it hasn't
   * been saved/opened from the cloud yet (empty placeholder tree, or a
   * locally opened folder/workspace not yet pushed). Set on first
   * successful Save, or when explicitly opening a cloud project. */
  currentProjectId: string | null;
  /** Bumped by resetTerminalWorkspaceBeforeSwitch every time it actually
   * resets the single terminal volume -- i.e. every project switch, since
   * the backend closes every live terminal session unconditionally as part
   * of that (see TerminalService.sync_and_reset_workspace). TerminalPanel.tsx
   * watches this to remount its tabs immediately with fresh connections,
   * so a switch leaves you with working terminals instead of ones quietly
   * showing "[session ended]" until you notice and manually open a new tab. */
  terminalResetGeneration: number;

  selectedIds: string[];
  anchorId: string | null;
  focusedId: string | null;
  activeFileId: string | null;
  revealId: string | null;

  renamingId: string | null;
  clipboard: ClipboardState | null;

  searchQuery: string;
  sort: SortOptions;
  view: ViewOptions;

  pinnedIds: string[];
  favoriteFolderIds: string[];
  recentFileIds: string[];

  dragIds: string[];
  dropTargetId: string | null;
  dropPosition: "before" | "after" | "inside" | null;

  sidebarWidth: number;
  sidebarCollapsed: boolean;
  activityView: ActivityView;
  scrollOffset: number;

  undoStack: UndoEntry[];
  propertiesTargetId: string | null;
  contextMenu: { x: number; y: number; targetId: string | null } | null;

  toggleExpand: (id: string) => void;
  setExpandedMany: (ids: string[], value: boolean) => void;
  expandAll: () => void;
  collapseAll: () => void;
  ensureLoaded: (id: string) => Promise<void>;

  selectSingle: (id: string) => void;
  toggleSelect: (id: string) => void;
  rangeSelect: (id: string, visibleRows: FlatRow[]) => void;
  selectAllVisible: (visibleRows: FlatRow[]) => void;
  clearSelection: () => void;
  moveFocus: (direction: FocusDirection, visibleRows: FlatRow[], opts?: MoveFocusOptions) => void;
  arrowRight: (id: string) => void;
  arrowLeft: (id: string) => void;

  startRename: (id: string) => void;
  commitRename: (name: string) => void;
  cancelRename: () => void;

  createFile: (parentId: string) => void;
  createFolder: (parentId: string) => void;
  /** Like `createFile`, but skips inline-rename and immediately opens the
   * new file for editing (explorer + editor tab) -- used by quick-create
   * entry points (WelcomeScreen, NoTestbenchDialog) where the point is to
   * start typing right away, not name the file first. Returns the new
   * node's id, or null if `parentId` isn't a folder. */
  createAndOpenFile: (parentId: string, desiredName: string, content?: string) => string | null;
  deleteSelected: () => void;
  duplicateNode: (id: string) => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteInto: (targetParentId: string) => void;
  moveNodes: (ids: string[], targetParentId: string, beforeId?: string | null) => void;

  downloadFile: (id: string) => void;
  downloadFolder: (id: string) => Promise<void>;
  copyPath: (id: string) => void;
  copyRelativePath: (id: string) => void;

  openFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  clearFileDirty: (id: string) => void;
  reveal: (id: string) => void;
  clearReveal: () => void;

  togglePinned: (id: string) => void;
  toggleFavorite: (id: string) => void;

  setSearchQuery: (q: string) => void;
  setSort: (partial: Partial<SortOptions>) => void;
  setView: (partial: Partial<ViewOptions>) => void;
  /** Pulls the current project's last-saved snapshot back from Supabase and
   * replaces the tree with it. No-op if no project is linked yet (nothing
   * saved this session) or nothing has been saved for it yet. */
  refresh: () => Promise<void>;
  /** Pushes the current tree to Supabase (Storage blob + Postgres metadata
   * row). Reuses `currentProjectId` if this tree is already linked to a
   * saved project; otherwise derives a fresh id from `workspaceName` and
   * links it, so later saves in this session update the same row. */
  saveToServer: () => Promise<void>;
  /** Fetches the list of every saved project (for the "Open Cloud Project"
   * picker) -- id/name/size/last-saved, most recent first. */
  listCloudProjects: () => Promise<ProjectSummary[]>;
  /** Loads a specific saved project by id, replacing the current tree and
   * linking `currentProjectId` to it so subsequent Saves/Refreshes target it. */
  openCloudProject: (projectId: string) => Promise<void>;

  setDrag: (ids: string[]) => void;
  setDropTarget: (id: string | null, position: "before" | "after" | "inside" | null) => void;
  endDrag: () => void;

  setSidebarWidth: (px: number) => void;
  toggleSidebarCollapsed: () => void;
  setActivityView: (view: ActivityView) => void;
  setScrollOffset: (px: number) => void;

  openContextMenu: (x: number, y: number, targetId: string | null) => void;
  closeContextMenu: () => void;
  openProperties: (id: string) => void;
  closeProperties: () => void;

  undo: () => void;

  openFolderFromFiles: (fileList: FileList) => Promise<void>;
  uploadFiles: (fileList: FileList, targetParentId: string) => Promise<void>;
  saveWorkspaceSnapshot: () => void;
  loadWorkspaceSnapshot: (json: string) => Promise<void>;

  /** Clears the `dirty` flag on every modified file (the toolbar's Save
   * button) -- content itself is already live in `node.content` via
   * `updateFileContent` on every keystroke, so "saving" here just marks the
   * workspace clean, the same thing the existing per-tab Ctrl+S already did
   * for just the active file. */
  saveAllFiles: () => void;
  /** Toolbar Import: routes a ZIP through `importZipProject`, routes loose
   * HDL/text files through the existing `uploadFiles`, and rejects anything
   * else up front. Returns `ok: false` with a friendly `error` message for
   * unsupported selections instead of throwing. */
  importProject: (fileList: FileList) => Promise<{ ok: boolean; error?: string; openedFileId?: string | null }>;
  importZipProject: (zipFile: File) => Promise<{ ok: boolean; error?: string; openedFileId?: string | null }>;
  /** "New Workspace > Empty Workspace" -- replaces the current tree with a
   * single, genuinely empty root folder (no seed/demo content). Same
   * whole-workspace-replace sequence as `openFolderFromFiles`/
   * `importZipProject` (terminal reset, close editor tabs, unlink cloud
   * project), just fed a synthetic empty tree instead of imported content. */
  startEmptyWorkspace: () => Promise<void>;
  /** "New Workspace > Verilog/SystemVerilog/VHDL Project" -- same
   * whole-workspace-replace sequence, fed a generated
   * src/tb/constraints/docs scaffold (see services/workspace/). Opens the
   * scaffold's primary src/ file once loaded. */
  startLanguageProjectWorkspace: (kind: ProjectLanguage, projectName: string) => Promise<void>;
}

export const useExplorerStore = create<ExplorerStore>()(
  persist(
    (set, get) => ({
      nodes: emptyTree,
      rootId: emptyRoot.id,
      workspaceName: "No Project Open",
      recentWorkspaces: [],

      expanded: {},
      loadingIds: {},
      isRefreshing: false,
      isSaving: false,
      lastSavedAt: null,
      syncError: null,
      currentProjectId: null,
      terminalResetGeneration: 0,

      selectedIds: [],
      anchorId: null,
      focusedId: null,
      activeFileId: null,
      revealId: null,

      renamingId: null,
      clipboard: null,

      searchQuery: "",
      sort: DEFAULT_SORT,
      view: DEFAULT_VIEW,

      pinnedIds: [],
      favoriteFolderIds: [],
      recentFileIds: [],

      dragIds: [],
      dropTargetId: null,
      dropPosition: null,

      sidebarWidth: 272,
      sidebarCollapsed: false,
      activityView: "explorer",
      scrollOffset: 0,

      undoStack: [],
      propertiesTargetId: null,
      contextMenu: null,

      toggleExpand: (id) => {
        const state = get();
        const willExpand = !state.expanded[id];
        set({ expanded: { ...state.expanded, [id]: willExpand } });
        if (willExpand) get().ensureLoaded(id);
      },

      setExpandedMany: (ids, value) => {
        set((state) => {
          const expanded = { ...state.expanded };
          for (const id of ids) expanded[id] = value;
          return { expanded };
        });
      },

      expandAll: () => {
        const state = get();
        const allFolderIds = Object.values(state.nodes)
          .filter((n): n is FolderNodeData => n.kind === "folder")
          .map((n) => n.id);
        const expanded: Record<string, boolean> = {};
        for (const id of allFolderIds) expanded[id] = true;
        set({ expanded });
        for (const id of allFolderIds) get().ensureLoaded(id);
      },

      collapseAll: () => set({ expanded: {} }),

      ensureLoaded: async (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || node.kind !== "folder" || node.childrenLoaded || state.loadingIds[id]) return;
        set((s) => ({ loadingIds: { ...s.loadingIds, [id]: true } }));
        await delay(220 + Math.random() * 220);
        const count = node.name === "stress_test_10k" ? 6000 : 0;
        const generated = generateStressChildren(id, count);
        const nodesUpdate: Record<string, TreeNode> = {};
        for (const g of generated) nodesUpdate[g.id] = g;
        set((s) => {
          const current = s.nodes[id] as FolderNodeData | undefined;
          if (!current) return { loadingIds: { ...s.loadingIds, [id]: false } };
          return {
            nodes: {
              ...s.nodes,
              ...nodesUpdate,
              [id]: { ...current, children: generated.map((g) => g.id), childrenLoaded: true },
            },
            loadingIds: { ...s.loadingIds, [id]: false },
          };
        });
      },

      selectSingle: (id) => set({ selectedIds: [id], anchorId: id, focusedId: id }),

      toggleSelect: (id) =>
        set((state) => {
          const has = state.selectedIds.includes(id);
          return {
            selectedIds: has ? state.selectedIds.filter((x) => x !== id) : [...state.selectedIds, id],
            anchorId: id,
            focusedId: id,
          };
        }),

      rangeSelect: (id, visibleRows) =>
        set((state) => {
          const anchor = state.anchorId ?? id;
          const ids = visibleRows.filter((r) => !r.skeleton).map((r) => r.id);
          const a = ids.indexOf(anchor);
          const b = ids.indexOf(id);
          if (a === -1 || b === -1) return { selectedIds: [id], focusedId: id };
          const [lo, hi] = a < b ? [a, b] : [b, a];
          return { selectedIds: ids.slice(lo, hi + 1), focusedId: id };
        }),

      selectAllVisible: (visibleRows) =>
        set({ selectedIds: visibleRows.filter((r) => !r.skeleton).map((r) => r.id) }),

      clearSelection: () => set({ selectedIds: [], anchorId: null, focusedId: null }),

      moveFocus: (direction, visibleRows, opts = {}) =>
        set((state) => {
          const ids = visibleRows.filter((r) => !r.skeleton).map((r) => r.id);
          if (ids.length === 0) return state;
          const pageSize = opts.pageSize ?? 12;
          let idx = state.focusedId ? ids.indexOf(state.focusedId) : -1;
          switch (direction) {
            case "up":
              idx = idx <= 0 ? 0 : idx - 1;
              break;
            case "down":
              idx = idx === -1 ? 0 : Math.min(ids.length - 1, idx + 1);
              break;
            case "home":
              idx = 0;
              break;
            case "end":
              idx = ids.length - 1;
              break;
            case "pageUp":
              idx = Math.max(0, idx - pageSize);
              break;
            case "pageDown":
              idx = Math.min(ids.length - 1, idx + pageSize);
              break;
          }
          const newId = ids[idx];
          if (opts.extend) {
            const anchor = state.anchorId ?? newId;
            const a = ids.indexOf(anchor);
            const [lo, hi] = a < idx ? [a, idx] : [idx, a];
            return { focusedId: newId, selectedIds: ids.slice(lo, hi + 1), anchorId: anchor };
          }
          return { focusedId: newId, selectedIds: [newId], anchorId: newId };
        }),

      arrowRight: (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || node.kind !== "folder") return;
        if (!state.expanded[id]) {
          get().toggleExpand(id);
        } else if (node.children.length > 0) {
          const firstId = node.children[0];
          set({ focusedId: firstId, selectedIds: [firstId], anchorId: firstId });
        }
      },

      arrowLeft: (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node) return;
        if (node.kind === "folder" && state.expanded[id]) {
          set((s) => ({ expanded: { ...s.expanded, [id]: false } }));
        } else if (node.parentId) {
          set({ focusedId: node.parentId, selectedIds: [node.parentId], anchorId: node.parentId });
        }
      },

      startRename: (id) => set({ renamingId: id, contextMenu: null }),
      cancelRename: () => set({ renamingId: null }),

      commitRename: (name) => {
        const state = get();
        const id = state.renamingId;
        if (!id) return;
        const node = state.nodes[id];
        const trimmed = name.trim();
        if (!node || !trimmed || trimmed === node.name) {
          set({ renamingId: null });
          return;
        }
        const parentId = node.parentId;
        const finalName = parentId ? uniqueName(state.nodes, parentId, trimmed, id) : trimmed;
        const prevName = node.name;
        set((s) => ({
          nodes: { ...s.nodes, [id]: { ...s.nodes[id], name: finalName, modifiedAt: Date.now() } },
          renamingId: null,
          undoStack: [
            ...s.undoStack,
            {
              kind: "rename",
              describe: `Rename to "${finalName}"`,
              apply: () =>
                set((s2) => ({ nodes: { ...s2.nodes, [id]: { ...s2.nodes[id], name: prevName } } })),
            },
          ],
        }));
      },

      createFile: (parentId) => {
        const state = get();
        const parent = state.nodes[parentId] as FolderNodeData | undefined;
        if (!parent) return;
        const name = uniqueName(state.nodes, parentId, "untitled.v");
        const node = makeFileNode(parentId, name, { content: "" });
        set({
          nodes: { ...state.nodes, [node.id]: node, [parentId]: { ...parent, children: [...parent.children, node.id] } },
          expanded: { ...state.expanded, [parentId]: true },
          selectedIds: [node.id],
          focusedId: node.id,
          anchorId: node.id,
          renamingId: node.id,
        });
      },

      createFolder: (parentId) => {
        const state = get();
        const parent = state.nodes[parentId] as FolderNodeData | undefined;
        if (!parent) return;
        const name = uniqueName(state.nodes, parentId, "New Folder");
        const node = makeFolderNode(parentId, name, { children: [], childrenLoaded: true });
        set({
          nodes: { ...state.nodes, [node.id]: node, [parentId]: { ...parent, children: [...parent.children, node.id] } },
          expanded: { ...state.expanded, [parentId]: true },
          selectedIds: [node.id],
          focusedId: node.id,
          anchorId: node.id,
          renamingId: node.id,
        });
      },

      createAndOpenFile: (parentId, desiredName, content = "") => {
        const state = get();
        const parent = state.nodes[parentId] as FolderNodeData | undefined;
        if (!parent) return null;
        const name = uniqueName(state.nodes, parentId, desiredName);
        const node = makeFileNode(parentId, name, { content });
        set({
          nodes: { ...state.nodes, [node.id]: node, [parentId]: { ...parent, children: [...parent.children, node.id] } },
          expanded: { ...state.expanded, [parentId]: true },
          selectedIds: [node.id],
          focusedId: node.id,
          anchorId: node.id,
        });
        get().openFile(node.id);
        useEditorStore.getState().openFile(node.id, { pin: true });
        return node.id;
      },

      deleteSelected: () => {
        const state = get();
        const ids = state.selectedIds.filter((id) => state.nodes[id]);
        if (ids.length === 0) return;
        const nodes = { ...state.nodes };
        const idSet = new Set(ids);
        const topIds = ids.filter((id) => !getAncestorIds(id, nodes).some((a) => idSet.has(a)));
        const removedSnapshots: { id: string; parentId: string; index: number; subtree: Record<string, TreeNode> }[] = [];

        for (const id of topIds) {
          const node = nodes[id];
          if (!node.parentId) continue;
          const parent = nodes[node.parentId] as FolderNodeData;
          const index = parent.children.indexOf(id);
          const descendantIds = getDescendantIds(id, nodes);
          const subtree: Record<string, TreeNode> = { [id]: nodes[id] };
          for (const d of descendantIds) subtree[d] = nodes[d];
          removedSnapshots.push({ id, parentId: node.parentId, index, subtree });

          delete nodes[id];
          for (const d of descendantIds) delete nodes[d];
          nodes[node.parentId] = { ...parent, children: parent.children.filter((cid) => cid !== id) };
        }

        const undoEntry: UndoEntry = {
          kind: "delete",
          describe: `Delete ${topIds.length} item(s)`,
          apply: () =>
            set((s) => {
              const restored = { ...s.nodes };
              for (const snap of removedSnapshots) {
                Object.assign(restored, snap.subtree);
                const parent = restored[snap.parentId] as FolderNodeData | undefined;
                if (!parent) continue;
                const children = [...parent.children];
                children.splice(Math.min(snap.index, children.length), 0, snap.id);
                restored[snap.parentId] = { ...parent, children };
              }
              return { nodes: restored };
            }),
        };

        set({ nodes, selectedIds: [], focusedId: null, undoStack: [...state.undoStack, undoEntry] });
      },

      duplicateNode: (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || !node.parentId) return;
        const parent = state.nodes[node.parentId] as FolderNodeData;
        const clones: Record<string, TreeNode> = {};
        const newId = cloneSubtree(id, node.parentId, state.nodes, clones);
        const finalName = uniqueName(state.nodes, node.parentId, node.name);
        clones[newId] = { ...clones[newId], name: finalName };
        const index = parent.children.indexOf(id);
        const children = [...parent.children];
        children.splice(index + 1, 0, newId);
        set({
          nodes: { ...state.nodes, ...clones, [node.parentId]: { ...parent, children } },
          selectedIds: [newId],
          focusedId: newId,
          anchorId: newId,
        });
      },

      copySelection: () => set({ clipboard: { ids: get().selectedIds, mode: "copy" } }),
      cutSelection: () => set({ clipboard: { ids: get().selectedIds, mode: "cut" } }),

      pasteInto: (targetParentId) => {
        const state = get();
        if (!state.clipboard || state.clipboard.ids.length === 0) return;
        const { ids, mode } = state.clipboard;

        if (mode === "cut") {
          get().moveNodes(ids, targetParentId);
          set({ clipboard: null });
          return;
        }

        const nodes = { ...state.nodes };
        const newIds: string[] = [];
        for (const id of ids) {
          if (!nodes[id]) continue;
          const clones: Record<string, TreeNode> = {};
          const newId = cloneSubtree(id, targetParentId, state.nodes, clones);
          const finalName = uniqueName({ ...nodes, ...clones }, targetParentId, nodes[id].name);
          clones[newId] = { ...clones[newId], name: finalName };
          Object.assign(nodes, clones);
          newIds.push(newId);
        }
        const target = nodes[targetParentId] as FolderNodeData;
        nodes[targetParentId] = { ...target, children: [...target.children, ...newIds] };
        set({ nodes, selectedIds: newIds, expanded: { ...state.expanded, [targetParentId]: true } });
      },

      moveNodes: (ids, targetParentId, beforeId = null) => {
        const state = get();
        const nodes = { ...state.nodes };
        const target = nodes[targetParentId];
        if (!target || target.kind !== "folder") return;

        const validIds = ids.filter((id) => {
          if (id === targetParentId) return false;
          if (!nodes[id]) return false;
          if (isDescendantOf(targetParentId, id, nodes)) return false;
          return true;
        });
        if (validIds.length === 0) return;

        for (const id of validIds) {
          const node = nodes[id];
          const oldParentId = node.parentId;
          if (oldParentId && oldParentId !== targetParentId) {
            const oldParent = nodes[oldParentId] as FolderNodeData;
            nodes[oldParentId] = { ...oldParent, children: oldParent.children.filter((cid) => cid !== id) };
            const renamed = uniqueName(nodes, targetParentId, node.name);
            nodes[id] = { ...node, parentId: targetParentId, name: renamed, modifiedAt: Date.now() };
          }
        }

        const targetFolder = nodes[targetParentId] as FolderNodeData;
        let children = targetFolder.children.filter((cid) => !validIds.includes(cid));
        const insertAt = beforeId ? children.indexOf(beforeId) : -1;
        children = insertAt === -1
          ? [...children, ...validIds]
          : [...children.slice(0, insertAt), ...validIds, ...children.slice(insertAt)];
        nodes[targetParentId] = { ...targetFolder, children, modifiedAt: Date.now() };

        set({ nodes, dragIds: [], dropTargetId: null, dropPosition: null });
      },

      downloadFile: (id) => {
        const node = get().nodes[id];
        if (!node || node.kind !== "file") return;
        const blob = new Blob([node.content ?? ""], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = node.name;
        a.click();
        URL.revokeObjectURL(url);
      },

      downloadFolder: async (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || node.kind !== "folder") return;
        const zip = new JSZip();
        const addToZip = (nodeId: string, zipFolder: JSZip) => {
          const n = state.nodes[nodeId];
          if (!n) return;
          if (n.kind === "file") {
            zipFolder.file(n.name, n.content ?? "");
          } else {
            const sub = zipFolder.folder(n.name);
            if (sub) n.children.forEach((cid) => addToZip(cid, sub));
          }
        };
        const root = zip.folder(node.name);
        if (root) node.children.forEach((cid) => addToZip(cid, root));
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${node.name}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      },

      copyPath: (id) => {
        const segments = getPathSegments(id, get().nodes);
        const path = "/" + segments.map((s) => s.name).join("/");
        navigator.clipboard?.writeText(path).catch(() => undefined);
      },

      copyRelativePath: (id) => {
        const segments = getPathSegments(id, get().nodes).slice(1);
        navigator.clipboard?.writeText(segments.map((s) => s.name).join("/")).catch(() => undefined);
      },

      openFile: (id) => {
        const node = get().nodes[id];
        if (!node || node.kind !== "file") return;
        set((state) => ({
          activeFileId: id,
          selectedIds: [id],
          focusedId: id,
          anchorId: id,
          recentFileIds: [id, ...state.recentFileIds.filter((x) => x !== id)].slice(0, 10),
        }));
      },

      updateFileContent: (id, content) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || node.kind !== "file") return;
        set({
          nodes: { ...state.nodes, [id]: { ...node, content, dirty: true, modifiedAt: Date.now() } },
        });
      },

      clearFileDirty: (id) => {
        const state = get();
        const node = state.nodes[id];
        if (!node || node.kind !== "file" || !node.dirty) return;
        set({ nodes: { ...state.nodes, [id]: { ...node, dirty: false } } });
      },

      reveal: (id) => {
        const state = get();
        const ancestors = getAncestorIds(id, state.nodes);
        const expanded = { ...state.expanded };
        for (const a of ancestors) expanded[a] = true;
        set({ expanded, selectedIds: [id], focusedId: id, anchorId: id, revealId: id });
        for (const a of ancestors) get().ensureLoaded(a);
      },

      clearReveal: () => set({ revealId: null }),

      togglePinned: (id) =>
        set((state) => ({
          pinnedIds: state.pinnedIds.includes(id)
            ? state.pinnedIds.filter((x) => x !== id)
            : [...state.pinnedIds, id],
        })),

      toggleFavorite: (id) =>
        set((state) => ({
          favoriteFolderIds: state.favoriteFolderIds.includes(id)
            ? state.favoriteFolderIds.filter((x) => x !== id)
            : [...state.favoriteFolderIds, id],
        })),

      setSearchQuery: (q) => set({ searchQuery: q }),
      setSort: (partial) => set((state) => ({ sort: { ...state.sort, ...partial } })),
      setView: (partial) => set((state) => ({ view: { ...state.view, ...partial } })),

      refresh: async () => {
        const projectId = get().currentProjectId;
        if (!projectId) {
          set({ syncError: "No project linked yet — Save/Upload or Open a Cloud Project first" });
          return;
        }
        set({ isRefreshing: true, syncError: null });
        try {
          const { snapshot } = await loadProjectSnapshot(projectId);
          const patch = stateFromSnapshot(snapshot);
          if (patch) set(patch);
          set({ isRefreshing: false });
        } catch (err) {
          set({ isRefreshing: false, syncError: err instanceof Error ? err.message : "Refresh failed" });
        }
      },

      saveToServer: async () => {
        set({ isSaving: true, syncError: null });
        try {
          const state = get();
          const projectId = state.currentProjectId ?? slugifyProjectId(state.workspaceName);
          const snapshot = snapshotFromState(state);
          const { savedAt } = await saveProjectSnapshot(projectId, state.workspaceName, snapshot);
          set({ isSaving: false, lastSavedAt: savedAt, currentProjectId: projectId });
        } catch (err) {
          set({ isSaving: false, syncError: err instanceof Error ? err.message : "Save failed" });
        }
      },

      listCloudProjects: () => listProjects(),

      openCloudProject: async (projectId) => {
        // See openProjectRequestId's doc: bail out at every await boundary
        // if a newer openCloudProject call has started since this one did --
        // its result is stale and must never clobber a more recent request.
        const requestId = ++openProjectRequestId;
        const syncResult = await resetTerminalWorkspaceBeforeSwitch();
        if (requestId !== openProjectRequestId) return;
        set({ isRefreshing: true, syncError: null });
        try {
          const { snapshot, savedAt } = await loadProjectSnapshot(projectId);
          if (requestId !== openProjectRequestId) return;
          const patch = stateFromSnapshot(snapshot);
          if (patch) {
            // Reopening the exact project the terminal was just synced for --
            // the fetch above should already reflect that save (it happened
            // before this request), but reapply defensively in case that
            // read-after-write didn't land for any reason; harmless no-op
            // otherwise since the content already matches.
            if (syncResult && syncResult.savedProjectId === projectId) {
              patch.nodes = mergeSyncedFilesIntoNodes(syncResult.synced, patch.nodes, patch.rootId);
            }
            // Editor tabs/active-file/open Monaco models are keyed by file
            // id alone (see EditorManager) and live in a separate store --
            // switching projects must explicitly tear them down, or tabs
            // (and their cached model content) from the *previous* project
            // keep showing in the editor even though the Explorer tree
            // below has already moved on to this one.
            useEditorStore.getState().closeAll();
            set(patch);
          }
          set({ isRefreshing: false, currentProjectId: projectId, lastSavedAt: savedAt });
        } catch (err) {
          if (requestId !== openProjectRequestId) return;
          set({ isRefreshing: false, syncError: err instanceof Error ? err.message : "Open failed" });
        }
        // The tree this pane's terminals should seed from is now final --
        // safe to remount them (a non-null syncResult means the backend
        // already closed every prior session as part of the reset above).
        if (syncResult) bumpTerminalGeneration();
      },

      setDrag: (ids) => set({ dragIds: ids }),
      setDropTarget: (id, position) => set({ dropTargetId: id, dropPosition: position }),
      endDrag: () => set({ dragIds: [], dropTargetId: null, dropPosition: null }),

      setSidebarWidth: (px) => set({ sidebarWidth: Math.min(560, Math.max(180, px)) }),
      toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setActivityView: (view) =>
        set((state) => ({
          activityView: view,
          sidebarCollapsed: view === state.activityView ? !state.sidebarCollapsed : false,
        })),
      setScrollOffset: (px) => set({ scrollOffset: px }),

      openContextMenu: (x, y, targetId) => set({ contextMenu: { x, y, targetId } }),
      closeContextMenu: () => set({ contextMenu: null }),
      openProperties: (id) => set({ propertiesTargetId: id, contextMenu: null }),
      closeProperties: () => set({ propertiesTargetId: null }),

      undo: () => {
        const state = get();
        const stack = [...state.undoStack];
        const last = stack.pop();
        if (!last) return;
        set({ undoStack: stack });
        last.apply();
      },

      openFolderFromFiles: async (fileList) => {
        const imported = await readImportedFiles(fileList);
        if (imported.length === 0) return;
        const syncResult = await resetTerminalWorkspaceBeforeSwitch();
        const topSegment = imported[0].relativePath.split("/")[0] || "workspace";
        const nodes: Record<string, TreeNode> = {};
        const root = makeFolderNode(null, topSegment, { id: "root", children: [] });
        nodes[root.id] = root;
        const stripped = imported.map((it) => ({
          ...it,
          relativePath: it.relativePath.split("/").slice(1).join("/") || it.name,
        }));
        const topIds = buildTreeFromImported(stripped, root.id, nodes);
        (nodes[root.id] as FolderNodeData).children = topIds;
        // A raw folder re-upload reads straight off disk, bypassing Supabase
        // entirely -- unlike openCloudProject, the save inside
        // resetTerminalWorkspaceBeforeSwitch has no way to reach this tree on
        // its own, so re-apply here whenever the folder's name matches what
        // was just left (the only signal available for a local-only project,
        // which has no stable id to compare instead).
        const finalNodes =
          syncResult && syncResult.previousWorkspaceName === topSegment
            ? mergeSyncedFilesIntoNodes(syncResult.synced, nodes, root.id)
            : nodes;
        // See openCloudProject's identical call for why this is required --
        // otherwise the previous project's tabs/models linger in the editor.
        useEditorStore.getState().closeAll();
        set({
          nodes: finalNodes,
          rootId: root.id,
          workspaceName: topSegment,
          expanded: {},
          selectedIds: [],
          focusedId: null,
          activeFileId: null,
          searchQuery: "",
          clipboard: null,
          undoStack: [],
          // A freshly opened local folder isn't the cloud project that used
          // to be loaded (if any) -- unlink so the next Save creates/updates
          // a project matching *this* folder instead of overwriting the old one.
          currentProjectId: null,
        });
        if (syncResult) bumpTerminalGeneration();
      },

      uploadFiles: async (fileList, targetParentId) => {
        const imported = await readImportedFiles(fileList);
        if (imported.length === 0) return;
        const state = get();
        const nodes = { ...state.nodes };
        const topIds = buildTreeFromImported(imported, targetParentId, nodes);
        const target = nodes[targetParentId] as FolderNodeData;
        nodes[targetParentId] = { ...target, children: [...target.children, ...topIds] };
        set({
          nodes,
          expanded: { ...state.expanded, [targetParentId]: true },
          selectedIds: topIds,
          focusedId: topIds[0] ?? null,
          anchorId: topIds[0] ?? null,
          revealId: topIds[0] ?? null,
        });
      },

      saveWorkspaceSnapshot: () => {
        const state = get();
        const snapshot = snapshotFromState(state);
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${state.workspaceName}.code-workspace.json`;
        a.click();
        URL.revokeObjectURL(url);
        set((s) => ({
          recentWorkspaces: [
            { name: state.workspaceName, savedAt: Date.now() },
            ...s.recentWorkspaces.filter((w) => w.name !== state.workspaceName),
          ].slice(0, 8),
        }));
      },

      loadWorkspaceSnapshot: async (json) => {
        try {
          const patch = stateFromSnapshot(JSON.parse(json));
          if (!patch) return;
          const syncResult = await resetTerminalWorkspaceBeforeSwitch();
          // Same reasoning as openFolderFromFiles: this reads straight from
          // the picked file, bypassing Supabase, so reapply here by name.
          if (syncResult && syncResult.previousWorkspaceName === patch.workspaceName) {
            patch.nodes = mergeSyncedFilesIntoNodes(syncResult.synced, patch.nodes, patch.rootId);
          }
          // A local .code-workspace.json isn't necessarily the cloud project
          // that used to be loaded (if any) -- unlink, same reasoning as
          // openFolderFromFiles.
          // See openCloudProject's identical call for why this is required --
          // otherwise the previous project's tabs/models linger in the editor.
          useEditorStore.getState().closeAll();
          set({ ...patch, currentProjectId: null });
          if (syncResult) bumpTerminalGeneration();
        } catch {
          // Malformed workspace file — ignore rather than crash the UI.
        }
      },

      saveAllFiles: () => {
        const state = get();
        const nodes = { ...state.nodes };
        let changed = false;
        for (const id of Object.keys(nodes)) {
          const n = nodes[id];
          if (n.kind === "file" && n.dirty) {
            nodes[id] = { ...n, dirty: false };
            changed = true;
          }
        }
        if (changed) set({ nodes });
      },

      importProject: async (fileList) => {
        const files = Array.from(fileList);
        if (files.length === 0) return { ok: false, error: "No file selected." };

        const invalid = files.filter((f) => !IMPORT_ALLOWED_EXTENSIONS.has(extname(f.name)));
        if (invalid.length > 0) {
          return {
            ok: false,
            error: `Unsupported file type${invalid.length > 1 ? "s" : ""}: ${invalid
              .map((f) => f.name)
              .join(", ")}. Supported formats: .zip, .v, .sv, .vhd, .vh, .txt`,
          };
        }

        const zipFile = files.find((f) => extname(f.name) === "zip");
        if (zipFile) return get().importZipProject(zipFile);

        const state = get();
        await get().uploadFiles(fileList, state.rootId);
        const newIds = get().selectedIds;
        const hdlId = pickFirstHdlFile(newIds, get().nodes);
        if (hdlId) {
          get().openFile(hdlId);
          useEditorStore.getState().openFile(hdlId, { pin: true });
        }
        return { ok: true, openedFileId: hdlId };
      },

      importZipProject: async (zipFile) => {
        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(zipFile);
        } catch {
          return { ok: false, error: "Couldn't read that ZIP archive — it may be corrupted." };
        }

        const entries = Object.values(zip.files).filter((f) => !f.dir);
        if (entries.length === 0) return { ok: false, error: "That ZIP archive is empty." };

        const paths = entries.map((e) => e.name.replace(/\\/g, "/"));
        const commonPrefix = findCommonZipTopFolder(paths);
        const rootName = commonPrefix || zipFile.name.replace(/\.zip$/i, "") || "imported-project";

        const imported: ImportedFile[] = [];
        for (const entry of entries) {
          const cleanPath = entry.name.replace(/\\/g, "/");
          const relativePath = commonPrefix ? cleanPath.slice(commonPrefix.length + 1) : cleanPath;
          if (!relativePath) continue;
          const name = relativePath.split("/").pop() ?? relativePath;
          let content: string | undefined;
          if (isTextExtension(name)) {
            content = await entry.async("string");
          }
          imported.push({
            name,
            relativePath,
            size: content ? new Blob([content]).size : 0,
            modifiedAt: entry.date ? entry.date.getTime() : Date.now(),
            content,
          });
        }

        const syncResult = await resetTerminalWorkspaceBeforeSwitch();
        const nodes: Record<string, TreeNode> = {};
        const root = makeFolderNode(null, rootName, { id: "root", children: [] });
        nodes[root.id] = root;
        const topIds = buildTreeFromImported(imported, root.id, nodes);
        (nodes[root.id] as FolderNodeData).children = topIds;

        // See openFolderFromFiles's identical check: a raw ZIP extraction
        // bypasses Supabase entirely, so re-apply the terminal's synced
        // files here if this import happens to match the project just left.
        const finalNodes =
          syncResult && syncResult.previousWorkspaceName === rootName
            ? mergeSyncedFilesIntoNodes(syncResult.synced, nodes, root.id)
            : nodes;

        useEditorStore.getState().closeAll();
        set({
          nodes: finalNodes,
          rootId: root.id,
          workspaceName: rootName,
          expanded: {},
          selectedIds: [],
          focusedId: null,
          activeFileId: null,
          searchQuery: "",
          clipboard: null,
          undoStack: [],
          currentProjectId: null,
        });
        if (syncResult) bumpTerminalGeneration();

        const hdlId = pickFirstHdlFile(Object.keys(finalNodes), finalNodes);
        if (hdlId) {
          get().openFile(hdlId);
          useEditorStore.getState().openFile(hdlId, { pin: true });
        }
        return { ok: true, openedFileId: hdlId };
      },

      startEmptyWorkspace: async () => {
        const syncResult = await resetTerminalWorkspaceBeforeSwitch();
        const root = makeFolderNode(null, "Untitled Workspace", { id: "root", children: [] });
        useEditorStore.getState().closeAll();
        set({
          nodes: { [root.id]: root },
          rootId: root.id,
          workspaceName: "Untitled Workspace",
          expanded: {},
          selectedIds: [],
          focusedId: null,
          activeFileId: null,
          searchQuery: "",
          clipboard: null,
          undoStack: [],
          currentProjectId: null,
        });
        if (syncResult) bumpTerminalGeneration();
      },

      startLanguageProjectWorkspace: async (kind, projectName) => {
        const syncResult = await resetTerminalWorkspaceBeforeSwitch();
        const { nodes, rootId, primaryFileId } = buildProjectScaffold(projectName, buildLanguageProjectFiles(kind, projectName));
        useEditorStore.getState().closeAll();
        set({
          nodes,
          rootId,
          workspaceName: projectName,
          expanded: { [rootId]: true },
          selectedIds: [],
          focusedId: null,
          activeFileId: null,
          searchQuery: "",
          clipboard: null,
          undoStack: [],
          currentProjectId: null,
        });
        if (syncResult) bumpTerminalGeneration();
        get().expandAll();
        if (primaryFileId) {
          get().openFile(primaryFileId);
          useEditorStore.getState().openFile(primaryFileId, { pin: true });
        }
      },
    }),
    {
      name: "vetfab-explorer-ui-v1",
      partialize: (state) => ({
        // The full workspace is persisted locally so a browser refresh
        // restores the EXACT tree the user was in -- including unsaved
        // edits, which live in each file node's `content` (see
        // updateFileContent) and would otherwise be lost. This local copy
        // is the source of truth for *display*; the backend cloud save is
        // the durable copy. currentProjectId is what ties the restored tree
        // back to its cloud project for subsequent Saves. Persisting these
        // three (not just an id) is what stops every reload from falling
        // back to the empty placeholder workspace.
        nodes: state.nodes,
        rootId: state.rootId,
        workspaceName: state.workspaceName,
        currentProjectId: state.currentProjectId,
        expanded: state.expanded,
        selectedIds: state.selectedIds,
        focusedId: state.focusedId,
        activeFileId: state.activeFileId,
        sort: state.sort,
        view: state.view,
        pinnedIds: state.pinnedIds,
        favoriteFolderIds: state.favoriteFolderIds,
        recentFileIds: state.recentFileIds,
        recentWorkspaces: state.recentWorkspaces,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        activityView: state.activityView,
      }),
      skipHydration: true,
    }
  )
);

/** Flattens the current tree into the flat `{name: relativePath, content}[]`
 * shape the integrated terminal's `init` payload wants (see ShellTerminal.tsx
 * / backend terminal_service.open_session) -- paths are relative to the
 * workspace root (e.g. "rtl/alu.v"), not wrapped in the root folder's own
 * name, matching how the Run pipeline already lays out `/workspace`. */
export function flattenTreeForTerminal(
  nodes: Record<string, TreeNode>,
  rootId: string
): { name: string; content: string }[] {
  const root = nodes[rootId] as FolderNodeData | undefined;
  if (!root) return [];
  const out: { name: string; content: string }[] = [];
  const walk = (id: string, prefix: string) => {
    const node = nodes[id];
    if (!node) return;
    if (node.kind === "file") {
      out.push({ name: prefix + node.name, content: node.content ?? "" });
    } else {
      node.children.forEach((cid) => walk(cid, `${prefix}${node.name}/`));
    }
  };
  root.children.forEach((cid) => walk(cid, ""));
  return out;
}

/** Folds terminal-persistence sync results (see `resetTerminalWorkspaceBeforeSwitch`)
 * back into the tree: updates content for already-tracked paths, and creates
 * whatever folder/file nodes are missing for genuinely new ones -- same
 * folder-creation approach `buildTreeFromImported` uses, just against an
 * existing tree instead of a fresh import. */
function mergeSyncedFilesIntoNodes(
  synced: { path: string; content: string }[],
  nodes: Record<string, TreeNode>,
  rootId: string,
  opts: { dirty?: boolean } = {}
): Record<string, TreeNode> {
  const dirty = opts.dirty ?? false;
  const next = { ...nodes };
  for (const { path, content } of synced) {
    const existingId = fileIdForRelativePath(path, next, rootId);
    if (existingId) {
      const existing = next[existingId] as FileNodeData;
      next[existingId] = { ...existing, content, dirty, modifiedAt: Date.now() };
      continue;
    }

    const segments = path.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;

    let parentId = rootId;
    for (const segment of segments) {
      const parent = next[parentId] as FolderNodeData | undefined;
      if (!parent || parent.kind !== "folder") break;
      const childId = parent.children.find((cid) => next[cid]?.kind === "folder" && next[cid]?.name === segment);
      if (childId) {
        parentId = childId;
        continue;
      }
      const newFolder = makeFolderNode(parentId, segment);
      next[newFolder.id] = newFolder;
      next[parentId] = { ...parent, children: [...parent.children, newFolder.id] };
      parentId = newFolder.id;
    }

    const parent = next[parentId] as FolderNodeData | undefined;
    if (!parent || parent.kind !== "folder") continue;
    const newFile = makeFileNode(parentId, fileName, { content, dirty });
    next[newFile.id] = newFile;
    next[parentId] = { ...parent, children: [...parent.children, newFile.id] };
  }
  return next;
}

/** Formerly merged the terminal's "files_changed" WebSocket messages (see
 * TerminalService._poll_terminal_files) live into the Explorer tree.
 *
 * DISABLED, deliberately: the terminal's single shared Docker volume retains
 * files across project switches, and the backend poller reports every such
 * leftover file as "new" the moment a freshly-switched project's terminal
 * connects. That dumped the *previous* project's entire tree (~30 stale
 * files: build/, ip/, messy/, etc.) into the just-loaded project ~0.5s after
 * it loaded -- the confirmed cause of the "click a project, it loads
 * correctly, then the tree reverts to a foreign one while the name stays
 * put" bug (captured live via Playwright: applyLiveTerminalFiles firing with
 * the whole leftover volume as its payload).
 *
 * The loaded/saved cloud project is now the single source of truth for the
 * Explorer tree; the terminal never mutates it. Re-enabling a *safe* version
 * of this (surfacing genuinely user-created files) requires a backend fix:
 * baseline EVERY file already present in the workspace at session-open time,
 * not just the app-seeded ones, so pre-existing volume files are never
 * mis-reported as new. Kept as a no-op so its ShellTerminal caller and the
 * message plumbing stay intact for that future work. */
export function applyLiveTerminalFiles(
  files: { path: string; content: string }[],
  originGeneration: number
): void {
  // intentionally a no-op -- see doc comment above. Params kept (and
  // referenced here) so the ShellTerminal caller / message plumbing stay
  // intact for the future, backend-baselined re-enable.
  void files;
  void originGeneration;
}

function bumpTerminalGeneration(): void {
  useExplorerStore.setState((s) => ({ terminalResetGeneration: s.terminalResetGeneration + 1 }));
}

interface TerminalSyncOutcome {
  synced: { path: string; content: string }[];
  /** Cloud project id these files were just saved under. Never null once
   * there's anything to sync: a project opened via "Open Folder" (no
   * `currentProjectId` -- there's nowhere on the user's actual disk to write
   * a browser-only file back to) gets auto-persisted to a *new* cloud slot
   * derived from its name the moment its terminal produces something worth
   * keeping, the same id `saveToServer` would use for an explicit Save. This
   * is what actually prevents data loss -- reapplying in-memory alone isn't
   * enough, since the very next tree load (a different project, or the same
   * local folder read fresh off disk again) has nothing to do with whatever
   * transient in-memory state existed a moment before. Null when there was
   * nothing to sync (nothing was saved, but a reset -- and every live
   * terminal session closing -- still happened). */
  savedProjectId: string | null;
  previousWorkspaceName: string;
}

/** Called at the start of every "switch to different project content"
 * action (openCloudProject / openFolderFromFiles / loadWorkspaceSnapshot) --
 * reconciles whatever the *current* project's terminal sessions changed in
 * the shell against the tracked tree (see backend's
 * TerminalService.sync_and_reset_workspace for the full reconciliation
 * rules: unconflicted shell changes get merged in, anything also edited in
 * the editor since is left alone), applies that merge to the project being
 * left (persisting it if it's cloud-linked) and deletes the single terminal
 * volume so it doesn't leave scratch data sitting on disk forever.
 *
 * Returns the sync outcome (or null if there was nothing to sync) so the
 * caller can *also* reapply it to whatever tree it loads next -- necessary
 * because "open the same project again" doesn't always mean "re-fetch from
 * Supabase" (a local folder re-upload or a loaded .code-workspace.json both
 * build their tree straight from what was picked, bypassing Supabase
 * entirely, so a save made here would otherwise go unseen until some later,
 * unrelated cloud refresh). Best-effort throughout -- a failed reset call
 * must never block switching projects, it just means whatever was in the
 * terminal is lost (same as it always was before this feature existed). */
async function resetTerminalWorkspaceBeforeSwitch(): Promise<TerminalSyncOutcome | null> {
  const before = useExplorerStore.getState();
  const trackedFiles: Record<string, string> = {};
  for (const f of flattenTreeForTerminal(before.nodes, before.rootId)) trackedFiles[f.name] = f.content;

  let result: { synced: { path: string; content: string }[]; skippedConflicts: string[] };
  try {
    const res = await fetch(`${API_URL}/api/v1/terminal/reset-workspace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackedFiles }),
    });
    if (!res.ok) return null;
    result = await res.json();
  } catch {
    return null;
  }

  if (result.skippedConflicts.length > 0) {
    console.warn(
      "Terminal workspace reset: kept the editor's version for file(s) also changed in the shell:",
      result.skippedConflicts
    );
  }
  // Note: even with nothing to sync, the backend still closed every live
  // terminal session as part of this call -- callers use a non-null return
  // (regardless of `synced.length`) as the signal to remount their tabs.
  if (result.synced.length === 0) {
    return { synced: [], savedProjectId: null, previousWorkspaceName: before.workspaceName };
  }

  const mergedNodes = mergeSyncedFilesIntoNodes(result.synced, before.nodes, before.rootId);
  useExplorerStore.setState({ nodes: mergedNodes });

  // Always persist -- not just when already cloud-linked. A local-folder
  // project has no other durable home at all (see this function's doc), so
  // skipping the save here for that case is exactly how terminal-created
  // files used to vanish the moment you switched to anything else.
  const savedProjectId = before.currentProjectId ?? slugifyProjectId(before.workspaceName);
  try {
    const snapshot = snapshotFromState({ ...before, nodes: mergedNodes });
    await saveProjectSnapshot(savedProjectId, before.workspaceName, snapshot);
  } catch {
    // Best-effort -- the merge is still applied locally either way; this
    // only means the synced files won't be in the *previous* project's
    // saved snapshot if this particular save call failed.
  }

  return { synced: result.synced, savedProjectId, previousWorkspaceName: before.workspaceName };
}
