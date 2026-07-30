import { TreeNode } from "@/types/explorer";
import { scanWorkspace } from "@/services/analysis/workspaceScanner";
import { classifyFile, inferLanguage } from "@/services/analysis/fileClassifier";
import { parseHdlFile } from "@/services/analysis/hdlParser";
import { buildDependencyGraph, detectTopModuleCandidates } from "@/services/analysis/dependencyAnalyzer";
import { extname } from "@/utils/format";
import { HdlFileAnalysis, HdlLanguageKind, ModuleInfo, WorkspaceFile } from "@/services/analysis/types";

export interface TopModuleForTestbench {
  relativePath: string;
  module: ModuleInfo;
  language: HdlLanguageKind;
  /** Folder id the source file lives in -- the generated testbench is
   * created as a sibling, not in a hardcoded `tb/` location, so this works
   * whether or not the workspace has any particular folder structure. */
  parentFolderId: string;
}

/** Thin composition of the same pipeline `stateManager.ts`'s `runAnalysis`
 * uses (scan -> classify -> parse -> dependency graph -> top-module ranking)
 * with the UX `delay()` calls and full execution-payload assembly stripped
 * out -- this only needs one module's real port list, not a full analysis
 * run. Returns null if the workspace has no RTL module to build a
 * testbench from at all. */
export function findTopModuleForTestbenchGeneration(
  nodes: Record<string, TreeNode>,
  rootId: string
): TopModuleForTestbench | null {
  const { files: rawFiles } = scanWorkspace(nodes, rootId);

  const scanned: WorkspaceFile[] = [];
  const contentByPath = new Map<string, string>();
  for (const raw of rawFiles) {
    const ext = extname(raw.name);
    const category = classifyFile(raw.relativePath, ext);
    if (category === null) continue;
    contentByPath.set(raw.relativePath, raw.node.content ?? "");
    scanned.push({
      id: raw.id,
      fileId: raw.id,
      name: raw.name,
      relativePath: raw.relativePath,
      extension: ext,
      depth: raw.depth,
      size: raw.node.size,
      modifiedAt: raw.node.modifiedAt,
      category,
      language: inferLanguage(ext),
    });
  }

  const analysisByPath = new Map<string, HdlFileAnalysis>();
  for (const file of scanned) {
    if (file.language === "verilog" || file.language === "systemverilog" || file.language === "vhdl") {
      analysisByPath.set(file.relativePath, parseHdlFile(file.relativePath, contentByPath.get(file.relativePath) ?? "", file.language));
    }
  }

  const graph = buildDependencyGraph(scanned, analysisByPath);
  const topModuleCandidates = detectTopModuleCandidates(scanned, analysisByPath, graph);
  const top = topModuleCandidates[0];
  if (!top) return null;

  const file = scanned.find((f) => f.relativePath === top.relativePath);
  const analysis = analysisByPath.get(top.relativePath);
  const moduleInfo = analysis?.modules.find((m) => m.name === top.name);
  const sourceEntry = rawFiles.find((raw) => raw.relativePath === top.relativePath);
  if (!file || !moduleInfo || !sourceEntry) return null;

  return {
    relativePath: top.relativePath,
    module: moduleInfo,
    language: file.language,
    parentFolderId: sourceEntry.node.parentId ?? rootId,
  };
}

function isClockPort(name: string): boolean {
  return /^(clk|clock)/i.test(name);
}

function isResetPort(name: string): boolean {
  return /^(rst|reset)/i.test(name);
}

/** Builds a real, compilable instantiation-based testbench from a module's
 * actual port list -- not a generic placeholder. Clock/reset-shaped ports
 * (by name) get driven automatically; everything else is zero-initialized
 * with a TODO, since there's no way to infer real stimulus. VHDL isn't
 * supported here (see NoTestbenchDialog -- extractVhdlPorts in hdlParser.ts
 * doesn't capture port types, so a synthesized VHDL testbench couldn't
 * declare correctly-typed signals). */
export function generateInstantiationTestbench(
  topModuleName: string,
  module: ModuleInfo,
  language: "verilog" | "systemverilog"
): string {
  const isSv = language === "systemverilog";
  const regKw = isSv ? "logic" : "reg";
  const wireKw = isSv ? "logic" : "wire";

  const decls: string[] = [];
  const drives: string[] = [];
  const portConns: string[] = [];

  for (const port of module.ports) {
    const width = port.width ? `${port.width} ` : "";
    const isInput = port.direction === "input";
    decls.push(`    ${isInput ? regKw : wireKw} ${width}${port.name}${isInput ? " = 0" : ""};`);
    portConns.push(`        .${port.name}(${port.name})`);

    if (!isInput) continue;
    if (isClockPort(port.name)) {
      drives.push(`    always #5 ${port.name} = ~${port.name};`);
    } else if (isResetPort(port.name)) {
      drives.push(`    // ${port.name}: deasserted after a short hold (see initial block below)`);
    }
  }

  const resetPort = module.ports.find((p) => p.direction === "input" && isResetPort(p.name));
  const activeLow = !!resetPort && /n$/i.test(resetPort.name);

  const lines = [
    `\`timescale 1ns/1ps`,
    `module ${topModuleName}_tb;`,
    ...decls,
    "",
    ...drives,
    "",
    "    initial begin",
    `        $dumpfile("${topModuleName}_tb.vcd");`,
    `        $dumpvars(0, ${topModuleName}_tb);`,
    ...(resetPort
      ? [
          `        ${resetPort.name} = ${activeLow ? "0" : "1"};`,
          `        #12 ${resetPort.name} = ${activeLow ? "1" : "0"};`,
        ]
      : []),
    "        // TODO: drive stimulus for the remaining inputs",
    "        #200 $finish;",
    "    end",
    "",
    `    ${topModuleName} dut (`,
    portConns.join(",\n"),
    "    );",
    "endmodule",
    "",
  ];
  return lines.join("\n");
}
