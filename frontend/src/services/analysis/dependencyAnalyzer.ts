import { DependencyEdge, DependencyGraph, HdlFileAnalysis, RankedCandidate, WorkspaceFile } from "./types";

/** Links files together via module instantiation, `include, and package usage.
 * Unresolved references (targets not found anywhere in the workspace) are kept
 * in the graph with resolved:false so the validator can flag them. */
export function buildDependencyGraph(
  files: WorkspaceFile[],
  analysisByPath: Map<string, HdlFileAnalysis>
): DependencyGraph {
  const moduleNameToFiles = new Map<string, string[]>();
  const packageNameToFiles = new Map<string, string[]>();

  for (const [path, analysis] of analysisByPath) {
    for (const mod of analysis.modules) {
      const list = moduleNameToFiles.get(mod.name) ?? [];
      list.push(path);
      moduleNameToFiles.set(mod.name, list);
    }
    for (const pkg of analysis.packages) {
      const list = packageNameToFiles.get(pkg.name) ?? [];
      list.push(path);
      packageNameToFiles.set(pkg.name, list);
    }
  }

  const edges: DependencyEdge[] = [];
  const nodeSet = new Set<string>();

  for (const [path, analysis] of analysisByPath) {
    nodeSet.add(path);

    for (const inst of analysis.instantiations) {
      const targets = moduleNameToFiles.get(inst.ofModule);
      if (targets && targets.length > 0) {
        for (const target of targets) {
          if (target === path) continue;
          edges.push({ from: path, to: target, type: "instantiation", resolved: true });
          nodeSet.add(target);
        }
      } else {
        edges.push({ from: path, to: inst.ofModule, type: "instantiation", resolved: false });
      }
    }

    for (const includeName of analysis.includeDirectives) {
      const baseName = includeName.split("/").pop();
      const match = files.find((f) => f.name === includeName || f.name === baseName);
      if (match) {
        edges.push({ from: path, to: match.relativePath, type: "include", resolved: true });
        nodeSet.add(match.relativePath);
      } else {
        edges.push({ from: path, to: includeName, type: "include", resolved: false });
      }
    }

    for (const pkgName of analysis.packageImports) {
      const targets = packageNameToFiles.get(pkgName);
      if (targets && targets.length > 0) {
        for (const target of targets) {
          edges.push({ from: path, to: target, type: "package-use", resolved: true });
          nodeSet.add(target);
        }
      } else {
        edges.push({ from: path, to: pkgName, type: "package-use", resolved: false });
      }
    }
  }

  return { nodes: Array.from(nodeSet), edges };
}

export function detectTopModuleCandidates(
  files: WorkspaceFile[],
  analysisByPath: Map<string, HdlFileAnalysis>,
  graph: DependencyGraph
): RankedCandidate[] {
  // Only an RTL file instantiating another RTL file implies "sub-module, not top" --
  // a testbench instantiating a file is precisely what makes that file a top candidate.
  const categoryByPath = new Map(files.map((f) => [f.relativePath, f.category]));
  const instantiatedByDesign = new Set(
    graph.edges
      .filter((e) => e.type === "instantiation" && e.resolved && categoryByPath.get(e.from) === "rtl")
      .map((e) => e.to)
  );
  const candidates: RankedCandidate[] = [];

  for (const file of files) {
    if (file.category !== "rtl") continue;
    const analysis = analysisByPath.get(file.relativePath);
    if (!analysis) continue;

    for (const mod of analysis.modules) {
      if (mod.kind !== "module" && mod.kind !== "entity") continue;
      let score = 0;
      const reasons: string[] = [];

      if (!instantiatedByDesign.has(file.relativePath)) {
        score += 2;
        reasons.push("Not instantiated by any other RTL design file");
      } else {
        reasons.push("Instantiated by another RTL design file (likely a sub-module)");
      }

      if (/tb|test/i.test(file.name)) {
        score -= 2;
        reasons.push("Filename suggests a testbench, unlikely to be top");
      } else {
        score += 1;
      }

      if (mod.ports.length > 0) {
        score += 1;
        reasons.push(`Has ${mod.ports.length} port(s)`);
      }

      candidates.push({ relativePath: file.relativePath, name: mod.name, score, reasons });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function detectTestbenchCandidates(
  files: WorkspaceFile[],
  analysisByPath: Map<string, HdlFileAnalysis>,
  graph: DependencyGraph
): RankedCandidate[] {
  const candidates: RankedCandidate[] = [];

  for (const file of files) {
    const analysis = analysisByPath.get(file.relativePath);
    if (!analysis) continue;

    let score = 0;
    const reasons: string[] = [];

    if (file.category === "testbench") {
      score += 2;
      reasons.push("Located in a testbench folder or named as one");
    }
    if (analysis.simulationHints.hasFinish) {
      score += 1;
      reasons.push("Calls $finish");
    }
    if (analysis.simulationHints.hasDumpfile) {
      score += 1;
      reasons.push("Calls $dumpfile");
    }
    const instantiatesDesign = graph.edges.some(
      (e) => e.from === file.relativePath && e.type === "instantiation" && e.resolved
    );
    if (instantiatesDesign) {
      score += 1;
      reasons.push("Instantiates a design module");
    }

    if (score > 0) {
      const topModuleName = analysis.modules[0]?.name ?? file.name;
      candidates.push({ relativePath: file.relativePath, name: topModuleName, score, reasons });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

/** DFS cycle detection over resolved edges (any type). A cycle here means a
 * real project problem -- e.g. two modules instantiating each other -- since
 * such a hierarchy could never elaborate. Returns each cycle as an ordered
 * path of relative paths, deduplicated regardless of which node it was found from. */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!edge.resolved) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }

  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const seenCycleKeys = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string) {
    visited.add(node);
    stack.push(node);
    onStack.add(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (onStack.has(next)) {
        const cycleStart = stack.indexOf(next);
        const cycle = stack.slice(cycleStart).concat(next);
        const key = Array.from(new Set(cycle)).sort().join("|");
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push(cycle);
        }
      }
    }

    stack.pop();
    onStack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}
