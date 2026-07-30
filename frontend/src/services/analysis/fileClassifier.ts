import { FileCategory, HdlLanguageKind } from "./types";

const RTL_EXTS = new Set(["v", "sv", "vhd", "vhdl"]);
const INCLUDE_EXTS = new Set(["svh", "vh"]);
const CONSTRAINT_EXTS = new Set(["sdc", "xdc", "ucf", "pdc"]);
const SCRIPT_EXTS = new Set(["tcl", "do", "sh", "py"]);
const DOC_EXTS = new Set(["md", "txt", "pdf"]);
const MISC_EXTS = new Set(["json", "yaml", "yml", "toml", "mem", "hex", "coe", "zip"]);

const KNOWN_EXTENSIONS = new Set([
  ...RTL_EXTS,
  ...INCLUDE_EXTS,
  ...CONSTRAINT_EXTS,
  ...SCRIPT_EXTS,
  ...DOC_EXTS,
  ...MISC_EXTS,
]);

function isTestbenchName(relativePath: string): boolean {
  const base = (relativePath.split("/").pop() ?? relativePath).replace(/\.[^./]+$/, "");
  return /^tb_|_tb$|^test_|_test$|testbench/i.test(base);
}

/** Returns null when the extension is unrecognized -- callers should skip the
 * file entirely from analysis, matching "ignore unsupported files". */
export function classifyFile(relativePath: string, extension: string): FileCategory | null {
  const ext = extension.toLowerCase();
  if (!KNOWN_EXTENSIONS.has(ext)) return null;

  const topFolder = relativePath.includes("/") ? relativePath.split("/")[0].toLowerCase() : null;

  if (RTL_EXTS.has(ext) && (topFolder === "tb" || isTestbenchName(relativePath))) return "testbench";
  if (topFolder === "rtl" && RTL_EXTS.has(ext)) return "rtl";
  if (topFolder === "include" || INCLUDE_EXTS.has(ext)) return "include";
  if (topFolder === "constraints" || CONSTRAINT_EXTS.has(ext)) return "constraints";
  if (topFolder === "scripts" || SCRIPT_EXTS.has(ext)) return "scripts";
  if (topFolder === "docs" || DOC_EXTS.has(ext)) return "documentation";
  if (RTL_EXTS.has(ext)) return "rtl";
  return "unknown";
}

export function inferLanguage(extension: string): HdlLanguageKind {
  const ext = extension.toLowerCase();
  if (ext === "sv" || ext === "svh") return "systemverilog";
  if (ext === "v" || ext === "vh") return "verilog";
  if (ext === "vhd" || ext === "vhdl") return "vhdl";
  return "other";
}
