import {
  ArchitectureInfo,
  HdlFileAnalysis,
  HdlLanguageKind,
  InstantiationInfo,
  ModuleInfo,
  PackageInfo,
  ParameterInfo,
  PortInfo,
} from "./types";

/** Static, regex/heuristic-based source inspection -- not a real HDL parser.
 * Good enough to surface module/port/dependency shape for pre-flight analysis;
 * unusual syntax (heavy macro use, exotic generics) may be missed or misread. */

const VERILOG_KEYWORDS = new Set([
  "module", "endmodule", "function", "endfunction", "task", "endtask", "if", "else", "for", "while",
  "case", "casex", "casez", "endcase", "always", "always_comb", "always_ff", "always_latch", "initial",
  "final", "assign", "begin", "end", "wire", "reg", "logic", "input", "output", "inout", "parameter",
  "localparam", "generate", "endgenerate", "genvar", "interface", "endinterface", "program",
  "endprogram", "package", "endpackage", "class", "endclass", "struct", "typedef", "enum", "import",
  "export", "posedge", "negedge", "return", "break", "continue", "repeat", "forever", "fork", "join",
  "join_any", "join_none", "default", "unique", "priority", "automatic", "static", "const", "signed",
  "unsigned", "integer", "real", "time", "bit", "byte", "shortint", "longint", "modport", "clocking",
]);

function stripVerilogComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");
}

function stripVhdlComments(content: string): string {
  return content.replace(/--[^\n]*/g, "");
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipWhitespaceAndComments(text: string, index: number): number {
  let i = index;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
    } else {
      break;
    }
  }
  return i;
}

/** Splits on a top-level separator, ignoring separators nested inside (), [], {}. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;

    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function extractSimpleNamed(content: string, keyword: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`\\b${keyword}\\s+([A-Za-z_]\\w*)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) names.push(m[1]);
  return names;
}

function extractNamesAfterKeyword(content: string, keyword: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`\\b${keyword}\\b([^;()]*)[;(]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const tokens = m[1].trim().split(/\s+/).filter(Boolean);
    const name = tokens[tokens.length - 1];
    if (name && /^[A-Za-z_]\w*$/.test(name)) names.push(name);
  }
  return names;
}

function extractParameters(block: string): ParameterInfo[] {
  if (!block.trim()) return [];
  return splitTopLevel(block, ",")
    .map((segment) => {
      const cleaned = segment.replace(/\bparameter\b/, "").trim();
      const eqIdx = cleaned.indexOf("=");
      if (eqIdx === -1) {
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        return { name: tokens[tokens.length - 1] ?? "" };
      }
      const namePart = cleaned.slice(0, eqIdx).trim();
      const nameTokens = namePart.split(/\s+/).filter(Boolean);
      return {
        name: nameTokens[nameTokens.length - 1] ?? "",
        defaultValue: cleaned.slice(eqIdx + 1).trim(),
      };
    })
    .filter((p): p is ParameterInfo => !!p.name && /^[A-Za-z_]\w*$/.test(p.name));
}

const PORT_TYPE_TOKENS = new Set(["input", "output", "inout", "wire", "reg", "logic", "signed", "unsigned"]);

function extractPorts(block: string, legacyDirections: Map<string, PortInfo["direction"]>): PortInfo[] {
  if (!block.trim()) return [];
  let lastDirection: PortInfo["direction"] = "unknown";
  return splitTopLevel(block, ",")
    .map((segment): PortInfo | null => {
      const dirMatch = segment.match(/\b(input|output|inout)\b/);
      if (dirMatch) lastDirection = dirMatch[1] as PortInfo["direction"];
      const widthMatch = segment.match(/\[[^\]]*\]/);
      const withoutWidth = segment.replace(/\[[^\]]*\]/g, "");
      const tokens = withoutWidth.split(/\s+/).filter((t) => t && !PORT_TYPE_TOKENS.has(t));
      const name = tokens[tokens.length - 1];
      if (!name || !/^[A-Za-z_]\w*$/.test(name)) return null;
      const direction = dirMatch ? (dirMatch[1] as PortInfo["direction"]) : (legacyDirections.get(name) ?? lastDirection);
      return widthMatch ? { name, direction, width: widthMatch[0] } : { name, direction };
    })
    .filter((p): p is PortInfo => p !== null);
}

function extractLegacyPortDirections(content: string): Map<string, PortInfo["direction"]> {
  const map = new Map<string, PortInfo["direction"]>();
  const re = /\b(input|output|inout)\s+(?:wire|reg|logic|signed|unsigned)?\s*(?:\[[^\]]*\]\s*)?([A-Za-z_][\w,\s]*?)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const direction = m[1] as PortInfo["direction"];
    for (const name of m[2].split(",").map((n) => n.trim()).filter(Boolean)) {
      map.set(name, direction);
    }
  }
  return map;
}

function extractModules(content: string): ModuleInfo[] {
  const modules: ModuleInfo[] = [];
  const legacyDirections = extractLegacyPortDirections(content);
  const moduleRe = /\bmodule\s+([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;

  while ((m = moduleRe.exec(content))) {
    const name = m[1];
    let cursor = skipWhitespaceAndComments(content, m.index + m[0].length);
    let paramBlock = "";

    if (content[cursor] === "#") {
      cursor = skipWhitespaceAndComments(content, cursor + 1);
      if (content[cursor] === "(") {
        const close = findMatchingParen(content, cursor);
        if (close !== -1) {
          paramBlock = content.slice(cursor + 1, close);
          cursor = skipWhitespaceAndComments(content, close + 1);
        }
      }
    }

    let portBlock = "";
    if (content[cursor] === "(") {
      const close = findMatchingParen(content, cursor);
      if (close !== -1) portBlock = content.slice(cursor + 1, close);
    }

    modules.push({
      kind: "module",
      name,
      parameters: extractParameters(paramBlock),
      ports: extractPorts(portBlock, legacyDirections),
    });
  }

  return modules;
}

function extractInstantiations(content: string): InstantiationInfo[] {
  const results: InstantiationInfo[] = [];
  const re = /\b([A-Za-z_]\w*)\s*(?:#\s*\([\s\S]*?\))?\s+([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const [, moduleName, instanceName] = m;
    if (VERILOG_KEYWORDS.has(moduleName) || VERILOG_KEYWORDS.has(instanceName)) continue;
    results.push({ instanceName, ofModule: moduleName });
  }
  return results;
}

function analyzeVerilog(relativePath: string, rawContent: string, language: "verilog" | "systemverilog"): HdlFileAnalysis {
  const content = stripVerilogComments(rawContent);

  const modules: ModuleInfo[] = [
    ...extractModules(content),
    ...extractSimpleNamed(content, "interface").map((name) => ({ kind: "interface" as const, name, ports: [], parameters: [] })),
    ...extractSimpleNamed(content, "program").map((name) => ({ kind: "program" as const, name, ports: [], parameters: [] })),
  ];
  const packages: PackageInfo[] = extractSimpleNamed(content, "package").map((name) => ({ name }));

  const includeDirectives: string[] = [];
  const includeRe = /`include\s+"([^"]+)"/g;
  let im: RegExpExecArray | null;
  while ((im = includeRe.exec(rawContent))) includeDirectives.push(im[1]);

  const timescaleMatch = rawContent.match(/`timescale\s+([^\r\n]+)/);

  const packageImports: string[] = [];
  const importRe = /\bimport\s+([A-Za-z_]\w*)\s*::/g;
  let pm: RegExpExecArray | null;
  while ((pm = importRe.exec(content))) packageImports.push(pm[1]);

  return {
    relativePath,
    language,
    modules,
    architectures: [],
    packages,
    tasks: extractNamesAfterKeyword(content, "task"),
    functions: extractNamesAfterKeyword(content, "function"),
    generateBlockCount: (content.match(/\bgenerate\b/g) ?? []).length,
    includeDirectives,
    timescale: timescaleMatch?.[1].trim(),
    instantiations: extractInstantiations(content),
    packageImports,
    simulationHints: {
      hasFinish: /\$finish\b/.test(content),
      hasDumpfile: /\$dumpfile\b/.test(content),
      hasInitialBlock: /\binitial\b/.test(content),
      hasDisplay: /\$display\b/.test(content),
    },
  };
}

function extractVhdlSection(body: string, keyword: string): string {
  const re = new RegExp(`\\b${keyword}\\s*\\(`, "i");
  const m = body.match(re);
  if (!m || m.index === undefined) return "";
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingParen(body, openIdx);
  if (closeIdx === -1) return "";
  return body.slice(openIdx + 1, closeIdx);
}

function extractVhdlGenerics(body: string): ParameterInfo[] {
  const section = extractVhdlSection(body, "generic");
  return splitTopLevel(section, ";").map((entry) => {
    const [namePart, ...rest] = entry.split(":");
    const restJoined = rest.join(":");
    const [, defaultValue] = restJoined.split(":=");
    return { name: namePart.trim(), defaultValue: defaultValue?.trim() };
  });
}

function extractVhdlPorts(body: string): PortInfo[] {
  const section = extractVhdlSection(body, "port");
  return splitTopLevel(section, ";").flatMap((entry) => {
    const [namesPart, ...rest] = entry.split(":");
    const restJoined = rest.join(":").trim();
    const names = namesPart.split(",").map((n) => n.trim()).filter(Boolean);
    const dirMatch = restJoined.match(/^(in|out|inout)\b/i);
    const direction: PortInfo["direction"] = dirMatch
      ? dirMatch[1].toLowerCase() === "in"
        ? "input"
        : dirMatch[1].toLowerCase() === "out"
          ? "output"
          : "inout"
      : "unknown";
    return names.map((name) => ({ name, direction }));
  });
}

function extractVhdlNamesAfterKeyword(content: string, keyword: string): string[] {
  const names: string[] = [];
  const re = new RegExp(`\\b${keyword}\\s+([A-Za-z_]\\w*)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) names.push(m[1]);
  return names;
}

function analyzeVhdl(relativePath: string, rawContent: string): HdlFileAnalysis {
  const content = stripVhdlComments(rawContent);

  const modules: ModuleInfo[] = [];
  const entityRe = /\bentity\s+([A-Za-z_]\w*)\s+is\b/gi;
  let em: RegExpExecArray | null;
  while ((em = entityRe.exec(content))) {
    const name = em[1];
    const bodyStart = em.index + em[0].length;
    const rest = content.slice(bodyStart);
    const endMatch = rest.match(new RegExp(`\\bend\\s+(?:entity\\s+)?${name}\\s*;`, "i"));
    const body = endMatch && endMatch.index !== undefined ? rest.slice(0, endMatch.index) : rest.slice(0, 3000);
    modules.push({
      kind: "entity",
      name,
      parameters: extractVhdlGenerics(body),
      ports: extractVhdlPorts(body),
    });
  }

  const architectures: ArchitectureInfo[] = [];
  const archRe = /\barchitecture\s+([A-Za-z_]\w*)\s+of\s+([A-Za-z_]\w*)\s+is\b/gi;
  let am: RegExpExecArray | null;
  while ((am = archRe.exec(content))) architectures.push({ name: am[1], entityName: am[2] });

  const packages: PackageInfo[] = [];
  const pkgRe = /\bpackage\s+([A-Za-z_]\w*)\s+is\b/gi;
  let pkm: RegExpExecArray | null;
  while ((pkm = pkgRe.exec(content))) packages.push({ name: pkm[1] });

  const packageImports: string[] = [];
  const useRe = /\buse\s+([\w.]+)\s*;/gi;
  let um: RegExpExecArray | null;
  while ((um = useRe.exec(content))) packageImports.push(um[1]);

  const instantiations: InstantiationInfo[] = [];
  const instRe = /\b([A-Za-z_]\w*)\s*:\s*(?:entity\s+work\.)?([A-Za-z_]\w*)\s*(?:generic\s+map|port\s+map)/gi;
  let inm: RegExpExecArray | null;
  while ((inm = instRe.exec(content))) instantiations.push({ instanceName: inm[1], ofModule: inm[2] });

  return {
    relativePath,
    language: "vhdl",
    modules,
    architectures,
    packages,
    tasks: extractVhdlNamesAfterKeyword(content, "procedure"),
    functions: extractVhdlNamesAfterKeyword(content, "function"),
    generateBlockCount: (content.match(/\bgenerate\b/gi) ?? []).length,
    includeDirectives: [],
    timescale: undefined,
    instantiations,
    packageImports,
    simulationHints: {
      hasFinish: /std\.env\.finish|\bassert\s+false\b/i.test(content),
      hasDumpfile: false,
      hasInitialBlock: /\bprocess\b/i.test(content),
      hasDisplay: /\breport\b/i.test(content),
    },
  };
}

/** Reads `content` purely in-memory for this call -- nothing here is retained
 * or echoed back into the returned analysis, keeping source text out of any
 * object that later flows into the manifest/payload. */
export function parseHdlFile(relativePath: string, content: string, language: HdlLanguageKind): HdlFileAnalysis {
  if (language === "vhdl") return analyzeVhdl(relativePath, content);
  return analyzeVerilog(relativePath, content, language === "systemverilog" ? "systemverilog" : "verilog");
}
