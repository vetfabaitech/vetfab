/** Position-aware HDL outline: a lightweight, line-indexed sibling to
 * `hdlParser.ts` (which deliberately carries no line/column info, since it
 * only ever fed the pre-flight execution payload). This is the single parse
 * pass backing every editor-navigation feature that needs "what construct is
 * at line N" -- the sticky module header, the status bar's cursor inspector,
 * and the workspace symbol index behind Search Symbols/Search Everywhere --
 * so none of them re-parse the file independently.
 *
 * Same philosophy as hdlParser.ts: static regex/heuristic scanning, not a
 * real parser. Good enough for typically-formatted RTL; unusual layouts
 * (single-line modules, heavy macro use) may be mis-scoped. */

export type OutlineKind = "module" | "function" | "task" | "always" | "entity" | "architecture" | "process";

export interface OutlineNode {
  id: string;
  kind: OutlineKind;
  /** Display name -- e.g. the module/entity/function/task/process name, or
   * the always-block variant ("always_ff") when there's no better name. */
  name: string;
  /** Extra context shown alongside `name` -- the always-block variant kept
   * separately from `name` so callers can choose "always_ff" vs "always_ff (clk)"-style
   * formatting; the entity name for a VHDL architecture. */
  detail?: string;
  startLine: number;
  endLine: number;
  /** Stack depth at the point this frame opened -- 0 for module/entity/
   * architecture, 1 for a function/task/always/process directly inside one. */
  depth: number;
}

type FrameKind = OutlineKind | "block";

interface Frame {
  kind: FrameKind;
  name: string;
  detail?: string;
  startLine: number;
  depth: number;
  /** Verilog `always*` bookkeeping: true until this frame's own opening
   * `begin` has been consumed (it may be on a later line than the keyword
   * itself, e.g. `always_ff @(posedge clk)\n  begin`). */
  awaitingFirstBegin?: boolean;
  /** Verilog `always*` bookkeeping: balance of begin/end pairs seen since
   * (and including) this frame's own opening begin -- reaching 0 closes it.
   * Nested begin/end (if/case/for bodies) never push their own frame while
   * an always frame is on top of the stack; they just move this counter,
   * which is what lets one counter track arbitrarily deep nesting without a
   * second parse pass. */
  beginDepth?: number;
}

const VERILOG_TOKEN =
  /\b(module|endmodule|function|endfunction|task|endtask|always_comb|always_ff|always_latch|always|begin|end)\b/g;

function captureModuleName(line: string, matchEnd: number): string {
  const m = line.slice(matchEnd).match(/^\s*([A-Za-z_]\w*)/);
  return m ? m[1] : "anonymous";
}

/** function/task headers can carry `automatic`/`static` and a return type
 * before the name (`function automatic int decode(...)`) -- grab the last
 * identifier before the argument list or the terminating `;`. */
function captureRoutineName(line: string, matchEnd: number): string {
  const rest = line.slice(matchEnd);
  const m = rest.match(/^[^;(]*?([A-Za-z_]\w*)\s*[\(;]/);
  if (m) return m[1];
  const idm = rest.match(/([A-Za-z_]\w*)/);
  return idm ? idm[1] : "anonymous";
}

function buildVerilogOutline(content: string): OutlineNode[] {
  const lines = content.split(/\r\n|\r|\n/);
  const stack: Frame[] = [];
  const nodes: OutlineNode[] = [];
  let inBlockComment = false;
  let idCounter = 0;

  const closeFrame = (frame: Frame, endLine: number) => {
    nodes.push({
      id: `outline-${idCounter++}`,
      kind: frame.kind as OutlineKind,
      name: frame.name,
      detail: frame.detail,
      startLine: frame.startLine,
      endLine,
      depth: frame.depth,
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let line = lines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf("*/");
      if (endIdx === -1) continue;
      line = line.slice(endIdx + 2);
      inBlockComment = false;
    }

    let cleaned = "";
    let rest = line;
    for (;;) {
      const start = rest.indexOf("/*");
      if (start === -1) {
        cleaned += rest;
        break;
      }
      cleaned += rest.slice(0, start);
      const end = rest.indexOf("*/", start + 2);
      if (end === -1) {
        inBlockComment = true;
        break;
      }
      rest = rest.slice(end + 2);
    }
    line = cleaned;

    const lineCommentIdx = line.indexOf("//");
    if (lineCommentIdx !== -1) line = line.slice(0, lineCommentIdx);
    line = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    if (!line.trim()) continue;

    VERILOG_TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VERILOG_TOKEN.exec(line))) {
      const token = match[1];
      const matchEnd = match.index + token.length;

      switch (token) {
        case "module": {
          stack.push({ kind: "module", name: captureModuleName(line, matchEnd), startLine: lineNo, depth: stack.length });
          break;
        }
        case "endmodule": {
          while (stack.length && stack[stack.length - 1].kind !== "module") stack.pop();
          const frame = stack.pop();
          if (frame) closeFrame(frame, lineNo);
          break;
        }
        case "function": {
          stack.push({ kind: "function", name: captureRoutineName(line, matchEnd), startLine: lineNo, depth: stack.length });
          break;
        }
        case "endfunction": {
          while (stack.length && stack[stack.length - 1].kind !== "function") stack.pop();
          const frame = stack.pop();
          if (frame) closeFrame(frame, lineNo);
          break;
        }
        case "task": {
          stack.push({ kind: "task", name: captureRoutineName(line, matchEnd), startLine: lineNo, depth: stack.length });
          break;
        }
        case "endtask": {
          while (stack.length && stack[stack.length - 1].kind !== "task") stack.pop();
          const frame = stack.pop();
          if (frame) closeFrame(frame, lineNo);
          break;
        }
        case "always":
        case "always_comb":
        case "always_ff":
        case "always_latch": {
          const restOfLine = line.slice(matchEnd);
          const semiIdx = restOfLine.indexOf(";");
          const beginMatch = restOfLine.match(/\bbegin\b/);
          const beginIdx = beginMatch ? restOfLine.indexOf(beginMatch[0]) : -1;
          const singleStatement = semiIdx !== -1 && (beginIdx === -1 || semiIdx < beginIdx);
          const frame: Frame = {
            kind: "always",
            name: token,
            detail: token,
            startLine: lineNo,
            depth: stack.length,
            awaitingFirstBegin: true,
            beginDepth: 0,
          };
          if (singleStatement) {
            closeFrame(frame, lineNo);
          } else {
            stack.push(frame);
          }
          break;
        }
        case "begin": {
          const top = stack[stack.length - 1];
          if (top && top.kind === "always" && top.awaitingFirstBegin) {
            top.awaitingFirstBegin = false;
            top.beginDepth = 1;
          } else if (top && top.kind === "always") {
            top.beginDepth = (top.beginDepth ?? 0) + 1;
          } else {
            stack.push({ kind: "block", name: "", startLine: lineNo, depth: stack.length });
          }
          break;
        }
        case "end": {
          const top = stack[stack.length - 1];
          if (!top) break;
          if (top.kind === "always") {
            top.beginDepth = (top.beginDepth ?? 1) - 1;
            if (top.beginDepth <= 0) {
              stack.pop();
              closeFrame(top, lineNo);
            }
          } else if (top.kind === "block") {
            stack.pop();
          }
          break;
        }
      }
    }
  }

  return nodes.sort((a, b) => a.startLine - b.startLine);
}

const VHDL_END_QUALIFIERS = new Set([
  "if", "case", "loop", "generate", "component", "record", "block", "units", "protected", "for",
]);

function buildVhdlOutline(content: string): OutlineNode[] {
  const lines = content.split(/\r\n|\r|\n/);
  const stack: Frame[] = [];
  const nodes: OutlineNode[] = [];
  let idCounter = 0;

  const closeTop = (endLine: number) => {
    const frame = stack.pop();
    if (!frame) return;
    nodes.push({
      id: `outline-${idCounter++}`,
      kind: frame.kind as OutlineKind,
      name: frame.name,
      detail: frame.detail,
      startLine: frame.startLine,
      endLine,
      depth: frame.depth,
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let line = lines[i];
    const dashIdx = line.indexOf("--");
    if (dashIdx !== -1) line = line.slice(0, dashIdx);
    if (!line.trim()) continue;

    const entityMatch = line.match(/\bentity\s+([A-Za-z_]\w*)\s+is\b/i);
    const archMatch = line.match(/\barchitecture\s+([A-Za-z_]\w*)\s+of\s+([A-Za-z_]\w*)\s+is\b/i);
    const endProcessMatch = /\bend\s+process\b/i.test(line);
    const endEntityMatch = /\bend\s+entity\b/i.test(line);
    const endArchMatch = /\bend\s+architecture\b/i.test(line);
    const processMatch = !endProcessMatch && !entityMatch && !archMatch && /\bprocess\b/i.test(line);
    const bareEndRaw = line.match(/^\s*end\s*([A-Za-z_]\w*)?\s*;/i);
    const bareEndQualifier = bareEndRaw?.[1]?.toLowerCase();
    const bareEndMatch =
      bareEndRaw &&
      !endProcessMatch &&
      !endEntityMatch &&
      !endArchMatch &&
      !(bareEndQualifier && VHDL_END_QUALIFIERS.has(bareEndQualifier));

    if (entityMatch) {
      stack.push({ kind: "entity", name: entityMatch[1], startLine: lineNo, depth: stack.length });
    } else if (archMatch) {
      stack.push({
        kind: "architecture",
        name: `${archMatch[1]} of ${archMatch[2]}`,
        detail: archMatch[2],
        startLine: lineNo,
        depth: stack.length,
      });
    } else if (processMatch) {
      const labelMatch = line.match(/^\s*([A-Za-z_]\w*)\s*:\s*process\b/i);
      stack.push({ kind: "process", name: labelMatch ? labelMatch[1] : "process", startLine: lineNo, depth: stack.length });
    } else if (endProcessMatch) {
      while (stack.length && stack[stack.length - 1].kind !== "process") stack.pop();
      closeTop(lineNo);
    } else if (endEntityMatch) {
      while (stack.length && stack[stack.length - 1].kind !== "entity") stack.pop();
      closeTop(lineNo);
    } else if (endArchMatch) {
      while (stack.length && stack[stack.length - 1].kind !== "architecture") stack.pop();
      closeTop(lineNo);
    } else if (bareEndMatch) {
      const top = stack[stack.length - 1];
      if (top && (top.kind === "entity" || top.kind === "architecture")) closeTop(lineNo);
    }
  }

  return nodes.sort((a, b) => a.startLine - b.startLine);
}

/** `monacoLanguage` is whatever `getMonacoLanguage()` (languageMapping.ts)
 * returned for the file -- "vhdl" or Monaco's built-in "verilog" id (used for
 * both Verilog and SystemVerilog, see that module's doc). */
export function buildHdlOutline(content: string, monacoLanguage: string): OutlineNode[] {
  return monacoLanguage === "vhdl" ? buildVhdlOutline(content) : buildVerilogOutline(content);
}

/** Innermost (smallest-span) node of the given kinds containing `line`, or
 * any kind if `kinds` is omitted. Linear scan over the outline's node list
 * (typically tens, not thousands, even for large files) -- the expensive
 * part (parsing) already happened once in `buildHdlOutline`, debounced on
 * content change; this runs on every cursor move/scroll and must stay cheap. */
export function findEnclosingNode(outline: OutlineNode[], line: number, kinds?: OutlineKind[]): OutlineNode | undefined {
  let best: OutlineNode | undefined;
  let bestSpan = Infinity;
  for (const node of outline) {
    if (kinds && !kinds.includes(node.kind)) continue;
    if (line < node.startLine || line > node.endLine) continue;
    const span = node.endLine - node.startLine;
    if (span < bestSpan) {
      best = node;
      bestSpan = span;
    }
  }
  return best;
}
