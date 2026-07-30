"use client";

import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import { useSettingsStore } from "@/store/settingsStore";

interface CodeEditorProps {
  onMount: OnMount;
}

let vhdlRegistered = false;
let leetcodeLightThemeRegistered = false;

/** A calmer, more spacious light theme than Monaco's stock "light" (which
 * carries over a lot of VS Code's default chrome: a harsh white/blue
 * selection, faint low-contrast line numbers, a visible gutter seam) --
 * tuned to match this app's light palette (see globals.css's `:root`
 * tokens; Monaco needs literal hex, so these are kept in sync by hand
 * rather than read from the CSS variables). Dark mode is untouched (still
 * plain "vs-dark"); this redesign only targets light mode. */
function registerLeetcodeLightTheme(monaco: Parameters<BeforeMount>[0]) {
  if (leetcodeLightThemeRegistered) return;
  leetcodeLightThemeRegistered = true;

  monaco.editor.defineTheme("leetcode-light", {
    base: "vs",
    inherit: true,
    rules: [{ token: "comment", foreground: "8A93A3", fontStyle: "italic" }],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1B2430",
      "editorLineNumber.foreground": "#C4CAD3",
      "editorLineNumber.activeForeground": "#57606E",
      "editor.lineHighlightBackground": "#F6F8FA",
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": "#2563EB",
      "editor.selectionBackground": "#DCE8FF",
      "editor.inactiveSelectionBackground": "#E4EDFE",
      "editorIndentGuide.background1": "#EEF1F5",
      "editorIndentGuide.activeBackground1": "#DDE2E9",
      "editorWidget.background": "#FFFFFF",
      "editorWidget.border": "#E2E6EC",
      "editorSuggestWidget.background": "#FFFFFF",
      "editorSuggestWidget.border": "#E2E6EC",
      "editorGutter.background": "#FFFFFF",
      "scrollbarSlider.background": "#00000014",
      "scrollbarSlider.hoverBackground": "#0000001F",
    },
  });
}

function registerVhdlLanguage(monaco: Parameters<BeforeMount>[0]) {
  if (vhdlRegistered) return;
  vhdlRegistered = true;

  monaco.languages.register({ id: "vhdl" });

  monaco.languages.setLanguageConfiguration("vhdl", {
    comments: { lineComment: "--" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.setMonarchTokensProvider("vhdl", {
    ignoreCase: true,
    defaultToken: "",
    keywords: [
      "entity", "architecture", "begin", "end", "process", "signal", "variable",
      "constant", "port", "generic", "map", "in", "out", "inout", "buffer",
      "component", "is", "of", "if", "then", "else", "elsif", "case", "when",
      "others", "loop", "for", "while", "generate", "downto", "to", "and", "or",
      "not", "xor", "nand", "nor", "std_logic", "std_logic_vector", "integer",
      "boolean", "bit", "bit_vector", "library", "use", "package", "type",
      "subtype", "record", "array", "function", "return", "wait", "after",
      "report", "severity", "null", "all", "attribute", "rising_edge",
      "falling_edge", "instantiation", "configuration",
    ],
    operators: ["<=", ":=", "=>", "==", "/=", ">=", "<=", "<", ">", "+", "-", "*", "/", "&"],
    tokenizer: {
      root: [
        [/--.*$/, "comment"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/[()[\]]/, "@brackets"],
        [/[<>=:/&+\-*]+/, "operator"],
      ],
    },
  });
}

/** Static Monaco mount point -- deliberately has no `path`/`value`/
 * `language`/`onChange` props. Model creation, tab switching, and content
 * sync are owned entirely by `EditorManager` (see its module doc); this
 * component's only job is to bootstrap the one long-lived editor instance
 * and hand it off via `onMount`. `MultiFileEditor` keeps it mounted for the
 * app's whole lifetime -- overlaying the Log panel/empty state on top of it
 * instead of unmounting it -- so Monaco never has a reason to dispose the
 * editor or any model out from under `EditorManager`. */
export default function CodeEditor({ onMount }: CodeEditorProps) {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const tabWidth = useSettingsStore((s) => s.tabWidth);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const minimap = useSettingsStore((s) => s.minimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);
  const smoothScrolling = useSettingsStore((s) => s.smoothScrolling);

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerVhdlLanguage(monaco);
    registerLeetcodeLightTheme(monaco);
  };

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorInstance.focus();
    onMount(editorInstance, monaco);
  };

  return (
    <Editor
      height="100%"
      theme={appTheme === "light" ? "leetcode-light" : "vs-dark"}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        fontSize,
        fontFamily:
          "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
        // Monaco's minimap already covers "click to jump"/viewport highlight/
        // live updates/resize-responsiveness out of the box; `minimap`
        // (enable/disable) is driven by settingsStore so it's already
        // future-ready for more IDE-settings UI without touching this file.
        minimap: { enabled: minimap, scale: 1, showSlider: "mouseover", renderCharacters: true },
        wordWrap: wordWrap ? "on" : "off",
        lineNumbers: lineNumbers ? "on" : "off",
        // Breakpoint gutter (Feature 6) -- click handling lives in
        // `useBreakpoints.ts`, which listens for GUTTER_GLYPH_MARGIN mouse
        // targets; this just reserves the margin for its dot decorations.
        glyphMargin: true,
        folding: true,
        matchBrackets: "always",
        autoIndent: "full",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        tabSize: tabWidth,
        smoothScrolling,
        padding: { top: 16, bottom: 16 },
      }}
    />
  );
}
