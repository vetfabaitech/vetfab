import { DependencyGraph } from "./types";

/** Kahn's algorithm topological sort: for a dependency edge {from, to}
 * ("from" depends on "to"), "to" must be compiled before "from". Any files
 * left over belong to a cycle (already surfaced separately by the validator)
 * -- they're appended in stable order so every compile-relevant file still
 * appears exactly once in the result. */
export function generateCompilationOrder(graph: DependencyGraph, compileRelevantPaths: string[]): string[] {
  const nodeSet = new Set(compileRelevantPaths);
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const path of compileRelevantPaths) inDegree.set(path, 0);

  const seenPairs = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.resolved) continue;
    if (edge.from === edge.to) continue;
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue;

    const pairKey = `${edge.to}=>${edge.from}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const dependents = adjacency.get(edge.to) ?? [];
    dependents.push(edge.from);
    adjacency.set(edge.to, dependents);
    inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
  }

  const queue: string[] = compileRelevantPaths.filter((p) => (inDegree.get(p) ?? 0) === 0).sort();
  const order: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift() as string;
    if (visited.has(node)) continue;
    visited.add(node);
    order.push(node);

    for (const next of (adjacency.get(node) ?? []).sort()) {
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  for (const path of compileRelevantPaths) {
    if (!visited.has(path)) order.push(path);
  }

  return order;
}
