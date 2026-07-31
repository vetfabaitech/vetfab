"use client";

import "@xterm/xterm/css/xterm.css";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { applyLiveTerminalFiles } from "@/store/explorerStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getApiUrl, getWsUrl } from "@/lib/env";

const API_URL = getApiUrl();

interface TerminalFile {
  name: string;
  content: string;
}

export interface ShellTerminalHandle {
  /** Redraws the prompt (see handleClear below for why this isn't term.clear()). */
  clear: () => void;
}

interface ShellTerminalProps {
  projectId: string;
  files: TerminalFile[];
  // The terminalResetGeneration this terminal belongs to -- forwarded to
  // applyLiveTerminalFiles so a stale post-switch "files_changed" can't
  // pollute a newly-loaded project (see that function's doc).
  generation: number;
  // Whether this tab is the one currently shown -- inactive tabs stay mounted
  // (so their session/scrollback survives) but are hidden via CSS.
  active: boolean;
  // Called whenever this session's own shell produces/updates a .vcd/.fst --
  // e.g. the user ran `iverilog`/`vvp` by hand rather than clicking Run.
  onWaveformAvailable?: (url: string) => void;
}

interface TerminalWsMessage {
  type: "ready" | "output" | "error" | "exit" | "waveform" | "files_changed";
  data?: string;
  message?: string;
  sessionId?: string;
  filename?: string;
  // Present only for "files_changed" -- new files the shell created, live
  // (see backend TerminalService._poll_terminal_files's doc for scope: only
  // ever brand-new paths, never a change to an already-tracked file).
  files?: { path: string; content: string }[];
}

// VS Code "Dark+" style ANSI palette so compiler/git/grep output colors look native.
const XTERM_THEME_DARK = {
  background: "#111111",
  foreground: "#d4d4d4",
  cursor: "#4ade80",
  cursorAccent: "#111111",
  selectionBackground: "#4ade8040",
  black: "#000000",
  red: "#f14c4c",
  green: "#4ade80",
  yellow: "#e5e510",
  blue: "#3b8eea",
  magenta: "#d670d6",
  cyan: "#29b8db",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#4ade80",
  brightYellow: "#e5e510",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

// VS Code "Light+" equivalent -- same role, readable on a near-white background.
const XTERM_THEME_LIGHT = {
  background: "#f3f3f5",
  foreground: "#1f1f1f",
  cursor: "#15803d",
  cursorAccent: "#f3f3f5",
  selectionBackground: "#15803d33",
  black: "#1f1f1f",
  red: "#cd3131",
  green: "#15803d",
  yellow: "#996f00",
  blue: "#0451a5",
  magenta: "#a626a4",
  cyan: "#0598bc",
  white: "#3a3a3a",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#15803d",
  brightYellow: "#996f00",
  brightBlue: "#0451a5",
  brightMagenta: "#a626a4",
  brightCyan: "#0598bc",
  brightWhite: "#1f1f1f",
};

function xtermThemeFor(appTheme: "light" | "dark") {
  return appTheme === "light" ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
}

const ShellTerminal = forwardRef<ShellTerminalHandle, ShellTerminalProps>(function ShellTerminal(
  { projectId, files, generation, active, onWaveformAvailable },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Snapshot of the editor content at mount time -- read once, used only to seed
  // the terminal container when the WS connection opens (not re-sent on edits;
  // Run results are synced separately via the backend's artifact-mirroring hook).
  const filesRef = useRef(files);
  // Fixed for this terminal's lifetime (it's remounted per generation via its
  // key) -- read in the WS message handler to reject stale post-switch syncs.
  const generationRef = useRef(generation);
  const onWaveformAvailableRef = useRef(onWaveformAvailable);

  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const terminalCursorBlink = useSettingsStore((s) => s.terminalCursorBlink);
  const appTheme = useSettingsStore((s) => s.appTheme);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Preferences panel's Terminal section: applied live (xterm's `.options`
  // is writable post-construction) rather than requiring a remount, so
  // dragging the font-size slider updates every open terminal tab
  // immediately -- refit afterwards since a font-size change reflows how
  // many rows/cols fit the same pixel area.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = terminalFontSize;
    term.options.cursorBlink = terminalCursorBlink;
    fitAddonRef.current?.fit();
  }, [terminalFontSize, terminalCursorBlink]);

  // Whole-app light/dark toggle: swap xterm's ANSI palette to match, same
  // live-update path as font size/cursor blink above.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = xtermThemeFor(appTheme);
  }, [appTheme]);

  useEffect(() => {
    onWaveformAvailableRef.current = onWaveformAvailable;
  }, [onWaveformAvailable]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      // Send a real Ctrl+L to the shell rather than xterm's own `.clear()`:
      // a client-side-only clear wipes the previously-drawn prompt out of the
      // buffer without telling bash, so anything typed afterwards would render
      // with no prompt in front of it. Ctrl+L makes bash redraw the screen
      // (prompt + current input line) itself, which is what a real terminal does.
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data: "\x0c" }));
      }
    },
  }));

  // Becoming visible again after being hidden (a different tab was active) --
  // xterm can't measure a `display:none` element, so refit on the next paint.
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [active]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: useSettingsStore.getState().terminalFontSize,
      lineHeight: 1.4,
      cursorBlink: useSettingsStore.getState().terminalCursorBlink,
      cursorStyle: "block",
      scrollback: 5000,
      theme: xtermThemeFor(useSettingsStore.getState().appTheme),
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Keyboard shortcuts. Everything NOT handled here (Ctrl+D, Ctrl+L, Up/Down
    // history, Ctrl+A/E/U/W/R readline editing, Tab completion, ...) is raw
    // bytes forwarded straight to bash, which already does the right thing --
    // only clipboard access needs browser APIs, since the shell process has no
    // way to reach the OS clipboard itself.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const ctrl = event.ctrlKey;
      const key = event.key.toLowerCase();

      // Copy: Ctrl+C only when there's a selection (otherwise it's SIGINT, as
      // usual), plus the unambiguous alt bindings Ctrl+Shift+C / Ctrl+Insert.
      const isCopy =
        (ctrl && key === "c" && !event.shiftKey && term.hasSelection()) ||
        (ctrl && event.shiftKey && key === "c") ||
        (ctrl && key === "insert" && term.hasSelection());
      if (isCopy) {
        event.preventDefault();
        navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
        return false;
      }

      // Paste: Ctrl+V, Ctrl+Shift+V, Shift+Insert -- read via the Clipboard API
      // and feed it through term.paste() (handles bracketed-paste wrapping for
      // bash). Must preventDefault(): xterm.js *also* has its own native
      // `paste` DOM-event listener on its hidden textarea, and without this
      // that fires independently of returning `false` here, pasting the
      // clipboard text a second time right after this one.
      const isPaste = (ctrl && key === "v") || (event.shiftKey && key === "insert");
      if (isPaste && navigator.clipboard?.readText) {
        event.preventDefault();
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) term.paste(text);
          })
          .catch(() => {});
        return false;
      }

      return true;
    });

    let cancelled = false;
    const ws = new WebSocket(`${getWsUrl()}/ws/terminal/${projectId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      ws.send(
        JSON.stringify({
          type: "init",
          files: filesRef.current,
          cols: term.cols,
          rows: term.rows,
        })
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as TerminalWsMessage;
      if (msg.type === "ready" && msg.sessionId) {
        sessionIdRef.current = msg.sessionId;
      } else if (msg.type === "output" && msg.data) {
        term.write(msg.data);
      } else if (msg.type === "waveform" && msg.filename && sessionIdRef.current) {
        // Cache-bust: the filename can stay the same across runs (e.g. always
        // wave.vcd) while its content changes, and a same-URL fetch could
        // otherwise be served stale from the browser cache.
        const url = `${API_URL}/api/v1/terminal/${sessionIdRef.current}/waveform/raw?t=${Date.now()}`;
        onWaveformAvailableRef.current?.(url);
      } else if (msg.type === "files_changed" && msg.files) {
        if (!cancelled) applyLiveTerminalFiles(msg.files, generationRef.current);
      } else if (msg.type === "error") {
        term.write(`\r\n\x1b[31m[terminal] ${msg.message ?? "connection error"}\x1b[0m\r\n`);
      } else if (msg.type === "exit") {
        term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
      }
    };

    ws.onclose = () => {
      if (cancelled) return;
      term.write("\r\n\x1b[90m[disconnected from terminal]\x1b[0m\r\n");
    };

    ws.onerror = () => {
      if (cancelled) return;
      term.write("\r\n\x1b[31m[terminal] WebSocket error\x1b[0m\r\n");
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    // Refit whenever the panel changes size (window resize or a drag-resized
    // split), not just on window `resize` -- the container can shrink/grow
    // without the window itself changing.
    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
    };
    // Intentionally mount once per component lifetime (= once per terminal tab):
    // re-running this would open a second container for the same tab.
  }, [projectId]);

  return (
    <div className={`h-full w-full px-2 py-2 ${active ? "" : "hidden"}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
});

export default ShellTerminal;
