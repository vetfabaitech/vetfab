import { FileNodeData, FolderNodeData, TreeNode } from "@/types/explorer";
import { isTextExtension } from "@/utils/format";

export { delay } from "@/utils/async";

let counter = 0;
export function genId(prefix = "n"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

const now = Date.now();
const DAY = 86_400_000;

function file(
  parentId: string,
  name: string,
  overrides: Partial<FileNodeData> = {}
): FileNodeData {
  return {
    id: genId("f"),
    kind: "file",
    name,
    parentId,
    size: overrides.size ?? Math.floor(400 + Math.random() * 12000),
    createdAt: overrides.createdAt ?? now - Math.floor(Math.random() * 30) * DAY,
    modifiedAt: overrides.modifiedAt ?? now - Math.floor(Math.random() * 10) * DAY,
    content: overrides.content,
    readOnly: overrides.readOnly,
    locked: overrides.locked,
    dirty: overrides.dirty,
    gitStatus: overrides.gitStatus ?? null,
  };
}

function folder(
  parentId: string | null,
  name: string,
  overrides: Partial<FolderNodeData> = {}
): FolderNodeData {
  return {
    id: overrides.id ?? genId("d"),
    kind: "folder",
    name,
    parentId,
    children: overrides.children ?? [],
    childrenLoaded: overrides.childrenLoaded ?? true,
    createdAt: now - Math.floor(Math.random() * 60) * DAY,
    modifiedAt: now - Math.floor(Math.random() * 15) * DAY,
    gitStatus: overrides.gitStatus ?? null,
  };
}

export interface SeedResult {
  nodes: Record<string, TreeNode>;
  rootId: string;
}

/** Deterministic seed HDL project used to populate the explorer before a real backend exists. */
export function createSeedTree(): SeedResult {
  const nodes: Record<string, TreeNode> = {};
  const add = (n: TreeNode) => {
    nodes[n.id] = n;
    return n.id;
  };

  const root = folder(null, "vetfab_project", { id: "root" });
  add(root);

  const rtl = folder(root.id, "rtl");
  const memory = folder(rtl.id, "memory");
  memory.children = [
    add(file(memory.id, "rom.v")),
    add(file(memory.id, "ram.v")),
  ];
  add(memory);
  rtl.children = [
    add(file(rtl.id, "alu.v")),
    add(file(rtl.id, "cpu_core.v")),
    add(file(rtl.id, "cpu_core.sv")),
    add(file(rtl.id, "decoder.sv")),
    add(file(rtl.id, "defines.svh")),
    memory.id,
  ];
  add(rtl);

  const tb = folder(root.id, "tb");
  tb.children = [
    add(file(tb.id, "tb_top.sv")),
    add(file(tb.id, "tb_alu.v")),
  ];
  add(tb);

  const sim = folder(root.id, "sim");
  const simOutput = folder(sim.id, "sim_output", { children: [] });
  add(simOutput);
  sim.children = [
    add(file(sim.id, "run.do")),
    add(file(sim.id, "wave.do")),
    simOutput.id,
  ];
  add(sim);

  const constraints = folder(root.id, "constraints");
  constraints.children = [
    add(file(constraints.id, "timing.tcl")),
    add(file(constraints.id, "pins.tcl")),
  ];
  add(constraints);

  const scripts = folder(root.id, "scripts");
  scripts.children = [
    add(file(scripts.id, "build.tcl")),
    add(file(scripts.id, "synth.tcl")),
  ];
  add(scripts);

  const ip = folder(root.id, "ip");
  const fifoGen = folder(ip.id, "fifo_gen");
  fifoGen.children = [
    add(file(fifoGen.id, "fifo.coe")),
    add(file(fifoGen.id, "fifo.v")),
  ];
  add(fifoGen);
  ip.children = [
    fifoGen.id,
    add(file(ip.id, "rom_init.mem")),
    add(file(ip.id, "boot.hex")),
  ];
  add(ip);

  const docs = folder(root.id, "docs");
  docs.children = [
    add(file(docs.id, "architecture.md")),
    add(file(docs.id, "notes.txt")),
    add(file(docs.id, "datasheet.pdf", { size: 482_331 })),
  ];
  add(docs);

  const build = folder(root.id, "build", { gitStatus: "ignored" });
  build.children = [
    add(file(build.id, "cpu_core.bit", { size: 1_204_812, gitStatus: "ignored" })),
    add(file(build.id, "report.zip", { size: 88_213, gitStatus: "ignored" })),
  ];
  add(build);

  const stress = folder(root.id, "stress_test_10k", { childrenLoaded: false, children: [] });
  add(stress);

  root.children = [
    rtl.id,
    tb.id,
    sim.id,
    constraints.id,
    scripts.id,
    ip.id,
    docs.id,
    build.id,
    stress.id,
    add(file(root.id, "vetfab.code-workspace")),
    add(file(root.id, "project.json")),
    add(file(root.id, "settings.toml")),
    add(file(root.id, "package.yaml")),
    add(
      file(root.id, "README.md", {
        gitStatus: "modified",
        content: "# VETFAB Project\n\nHDL workspace scaffold.\n",
      })
    ),
    add(file(root.id, ".gitignore", { content: "build/\n*.log\n" })),
  ];

  return { nodes, rootId: root.id };
}

/** Simulates a lazily-generated large directory to prove the tree scales to 100k+ files. */
export function generateStressChildren(parentId: string, count: number): FileNodeData[] {
  const exts = ["v", "sv", "vhd", "mem", "json"];
  const out: FileNodeData[] = [];
  for (let i = 0; i < count; i += 1) {
    const ext = exts[i % exts.length];
    out.push(
      file(parentId, `module_${String(i).padStart(5, "0")}.${ext}`, {
        size: 200 + ((i * 37) % 9000),
      })
    );
  }
  return out;
}

export interface ImportedFile {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: number;
  content?: string;
}

/** Reads real browser File objects (from <input type=file webkitdirectory> or drag/drop uploads). */
export async function readImportedFiles(fileList: FileList | File[]): Promise<ImportedFile[]> {
  const files = Array.from(fileList);
  const results: ImportedFile[] = [];
  for (const f of files) {
    const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    let content: string | undefined;
    if (isTextExtension(f.name) && f.size < 2_000_000) {
      content = await f.text();
    }
    results.push({
      name: f.name,
      relativePath: relPath,
      size: f.size,
      modifiedAt: f.lastModified,
      content,
    });
  }
  return results;
}

export function makeFileNode(parentId: string, name: string, overrides: Partial<FileNodeData> = {}): FileNodeData {
  return file(parentId, name, overrides);
}

export function makeFolderNode(parentId: string | null, name: string, overrides: Partial<FolderNodeData> = {}): FolderNodeData {
  return folder(parentId, name, overrides);
}

/** Reconstructs a nested folder/file structure from imported files' relative paths under a given parent. */
export function buildTreeFromImported(
  imported: ImportedFile[],
  parentId: string,
  nodesOut: Record<string, TreeNode>
): string[] {
  const folderByPath = new Map<string, FolderNodeData>();
  const topLevelIds: string[] = [];

  const ensureFolder = (segments: string[]): string => {
    if (segments.length === 0) return parentId;
    const path = segments.join("/");
    const existing = folderByPath.get(path);
    if (existing) return existing.id;

    const parentPath = segments.slice(0, -1);
    const parent = ensureFolder(parentPath);
    const f = folder(parent, segments[segments.length - 1]);
    folderByPath.set(path, f);
    nodesOut[f.id] = f;
    if (parent === parentId) topLevelIds.push(f.id);
    else {
      const parentFolder = nodesOut[parent] as FolderNodeData;
      parentFolder.children.push(f.id);
    }
    return f.id;
  };

  for (const item of imported) {
    const segments = item.relativePath.split("/").filter(Boolean);
    const fileName = segments.pop() as string;
    const parentIdForFile = ensureFolder(segments);
    const f = file(parentIdForFile, fileName, {
      size: item.size,
      modifiedAt: item.modifiedAt,
      content: item.content,
    });
    nodesOut[f.id] = f;
    if (parentIdForFile === parentId) topLevelIds.push(f.id);
    else {
      const parentFolder = nodesOut[parentIdForFile] as FolderNodeData;
      parentFolder.children.push(f.id);
    }
  }

  return topLevelIds;
}
