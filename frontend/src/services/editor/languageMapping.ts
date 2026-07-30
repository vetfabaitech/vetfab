const EXTENSION_TO_MONACO_LANGUAGE: Record<string, string> = {
  v: "verilog",
  sv: "verilog",
  svh: "verilog",
  vh: "verilog",
  vhd: "vhdl",
  vhdl: "vhdl",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  md: "markdown",
  txt: "plaintext",
  sh: "shell",
  do: "plaintext",
  tcl: "plaintext",
  sdc: "plaintext",
  xdc: "plaintext",
  mem: "plaintext",
  hex: "plaintext",
  coe: "plaintext",
};

/** Maps a file extension to a Monaco language id. Verilog/SystemVerilog share
 * Monaco's built-in "verilog" grammar; VHDL uses the custom tokenizer
 * registered in HdlCodeEditor. Everything else falls back to a reasonable
 * built-in Monaco language, or plaintext. */
export function getMonacoLanguage(extension: string): string {
  return EXTENSION_TO_MONACO_LANGUAGE[extension.toLowerCase()] ?? "plaintext";
}
