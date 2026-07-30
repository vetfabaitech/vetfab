export interface VcdSignal {
  /** VCD's own single/multi-char identifier code (e.g. "!", "\"#") -- several
   * signals can share one code when they're aliases of the same net. */
  identifierCode: string;
  name: string;
  /** VCD `$var` type keyword -- "wire", "reg", "integer", "parameter", etc. */
  type: string;
  width: number;
  /** Dot-joined `$scope` path + name, e.g. "tb.dut.counter". */
  hierarchyPath: string;
  /** Raw VCD value string from the dump immediately after
   * `$enddefinitions $end` (e.g. "1", "b1010", "r1.5") -- present only when
   * the file's initial dump declared it. This is the value at simulation
   * time 0, not a live value: nothing about this app's execution pipeline
   * streams value changes back to the client (see `useVcdSignals.ts`'s doc)
   * so a "current value during simulation" as a continuously-updating
   * number isn't honestly implementable yet. */
  initialValue?: string;
}

/** Best-effort VCD header parser -- same heuristic-scan philosophy as
 * `hdlParser.ts`/`hdlOutline.ts` (this codebase has no full VCD/FST parser
 * anywhere; Surfer's embedded WASM viewer has one internally but doesn't
 * expose it to the host page). Handles the standard single-line
 * `$scope`/`$var`/`$upscope`/`$enddefinitions` declaration format iverilog's
 * `$dumpfile`/`$dumpvars` produces; unusual/hand-written VCD may be
 * mis-scoped. */
export function parseVcdHeader(vcdText: string): VcdSignal[] {
  const lines = vcdText.split(/\r\n|\r|\n/);
  const scopeStack: string[] = [];
  const signals: VcdSignal[] = [];
  const byId = new Map<string, VcdSignal[]>();
  let i = 0;

  for (; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("$enddefinitions")) {
      i += 1;
      break;
    }
    if (line.startsWith("$scope")) {
      const m = line.match(/^\$scope\s+\S+\s+(\S+)/);
      if (m) scopeStack.push(m[1]);
      continue;
    }
    if (line.startsWith("$upscope")) {
      scopeStack.pop();
      continue;
    }
    if (line.startsWith("$var")) {
      const m = line.match(/^\$var\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)/);
      if (!m) continue;
      const [, type, widthStr, identifierCode, name] = m;
      const signal: VcdSignal = {
        identifierCode,
        name,
        type,
        width: Number(widthStr) || 1,
        hierarchyPath: [...scopeStack, name].join("."),
      };
      signals.push(signal);
      const aliases = byId.get(identifierCode) ?? [];
      aliases.push(signal);
      byId.set(identifierCode, aliases);
    }
  }

  applyInitialValues(lines, i, byId);
  return signals;
}

/** Reads value-change lines from just after `$enddefinitions $end` through
 * the second `#<time>` marker (inclusive of any value lines before the
 * first one, since `$dumpvars` blocks don't always lead with `#0`) -- this
 * captures the file's initial dump without needing to walk the entire value
 *-change stream for a potentially large simulation. */
function applyInitialValues(lines: string[], startIndex: number, byId: Map<string, VcdSignal[]>): void {
  let timeMarkers = 0;
  for (let i = startIndex; i < lines.length && timeMarkers < 2; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      timeMarkers += 1;
      continue;
    }
    if (line.startsWith("$dumpvars") || line.startsWith("$end") || line.startsWith("$comment")) continue;

    let identifierCode: string | undefined;
    let value: string | undefined;
    const vector = line.match(/^[bBrR]([01xzXZ.\-][^\s]*)\s+(\S+)$/);
    if (vector) {
      value = `${line[0]}${vector[1]}`;
      identifierCode = vector[2];
    } else {
      const scalar = line.match(/^([01xzXZ])(\S+)$/);
      if (scalar) {
        value = scalar[1];
        identifierCode = scalar[2];
      }
    }
    if (!identifierCode || value === undefined) continue;
    for (const signal of byId.get(identifierCode) ?? []) signal.initialValue = value;
  }
}

export interface VcdTreeNode {
  name: string;
  path: string;
  signal?: VcdSignal;
  children: VcdTreeNode[];
}

/** Groups a flat signal list into the scope hierarchy the Objects panel's
 * tree view renders -- pure/derived from `parseVcdHeader`'s output, no
 * separate parse. */
export function buildVcdTree(signals: VcdSignal[]): VcdTreeNode[] {
  const root: VcdTreeNode = { name: "", path: "", children: [] };
  for (const signal of signals) {
    const segments = signal.hierarchyPath.split(".");
    let node = root;
    let pathSoFar = "";
    for (let i = 0; i < segments.length; i += 1) {
      pathSoFar = pathSoFar ? `${pathSoFar}.${segments[i]}` : segments[i];
      const isLeaf = i === segments.length - 1;
      let child = node.children.find((c) => c.name === segments[i]);
      if (!child) {
        child = { name: segments[i], path: pathSoFar, children: [] };
        node.children.push(child);
      }
      if (isLeaf) child.signal = signal;
      node = child;
    }
  }
  return root.children;
}
