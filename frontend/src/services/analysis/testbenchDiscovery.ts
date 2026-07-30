import { TreeNode } from "@/types/explorer";
import { extname } from "@/utils/format";
import { classifyFile } from "./fileClassifier";
import { scanWorkspace } from "./workspaceScanner";

export interface TestbenchFileRef {
  /** Explorer node id -- used both as the testbench-selection key and as the
   * override id threaded into runAnalysis. */
  id: string;
  name: string;
  relativePath: string;
}

/** Lightweight discovery (scan + classify only, no HDL parsing) of every
 * testbench-category file currently in the workspace -- shared by the
 * testbench selector dropdown and "Run All", so both always agree on exactly
 * which testbenches exist. */
export function listTestbenchFiles(nodes: Record<string, TreeNode>, rootId: string): TestbenchFileRef[] {
  const { files } = scanWorkspace(nodes, rootId);
  return files
    .filter((f) => classifyFile(f.relativePath, extname(f.name)) === "testbench")
    .map((f) => ({ id: f.id, name: f.name, relativePath: f.relativePath }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
