"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSimulationStore } from "@/store/simulationStore";
import { useSettingsStore, type AppTheme } from "@/store/settingsStore";
import { IconChevronDown, IconClose, IconDownload, IconExpand, IconSettings } from "./icons";

/** Surfer theme names, as best determined from strings embedded in the
 * shipped `surfer_bg.wasm` (there's no public docs for this beyond
 * `integration.js`'s comment that any `surfer::Message` can be injected,
 * "unstable" API) -- doc-comment-shaped phrases "VSCode Light+ theme"/
 * "VSCode Dark+ theme" turned up verbatim next to the `SelectTheme` message
 * variant name, so these are a best-effort match to this app's own
 * light/dark toggle, not a documented/verified mapping. Worst case if the
 * name is slightly off: Surfer logs "Failed to set theme" internally and
 * keeps its own default -- no crash, no regression to the (separately
 * proven) `scope_add_recursive` startup command this doesn't touch. */
const SURFER_THEME_NAME: Record<AppTheme, string> = {
  light: "VSCode Light+",
  dark: "VSCode Dark+",
};

/** VCD's outermost `$scope <type> <name> ... $end` declares the top-level
 * module Surfer will show in its scope tree -- e.g. `$scope module tb $end`
 * -> "tb". Used to tell Surfer which scope to auto-expand; recursing from
 * here also picks up any nested submodule scopes/variables in one go. */
function extractTopScopeName(vcdText: string): string | null {
  const match = vcdText.match(/\$scope\s+\S+\s+(\S+)\s+\$end/);
  return match ? match[1] : null;
}

/** Embeds the Surfer waveform viewer (self-hosted static build at
 * /surfer/index.html, see frontend/public/). Rather than the previous
 * postMessage-based `LoadUrl` (which only loaded the file and still left the
 * user to click through Surfer's scope tree to see any signal), this passes
 * `load_url`/`startup_commands` as query params on the iframe's initial
 * navigation -- Surfer's own startup sequence reads these itself, so there's
 * no WASM-init race to retry around, and `scope_add_recursive <name>` makes
 * every variable appear immediately without an extra click.
 *
 * Theme sync (light/dark following this app's own toggle) uses the OTHER,
 * actually-documented integration path instead: `integration.js`'s
 * postMessage `InjectMessage` command, sent once Surfer's had a moment to
 * finish initializing after the iframe loads, and again on every app theme
 * change after that. See `SURFER_THEME_NAME`'s doc for why the exact theme
 * name is a best-effort guess. */
function SurferFrame({ vcdUrl, focusedSignalPath }: { vcdUrl: string; focusedSignalPath: string | null }) {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const [src, setSrc] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [surferReady, setSurferReady] = useState(false);

  const sendTheme = useCallback((theme: AppTheme) => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      { command: "InjectMessage", message: JSON.stringify({ SelectTheme: SURFER_THEME_NAME[theme] }) },
      "*"
    );
  }, []);

  // Resets on every navigation (new `src`) -- adjusted during render (React's
  // documented pattern for state derived from a changed prop) rather than in
  // an effect. Surfer's WASM needs to finish initializing inside the iframe
  // before `window.inject_message` exists there; the iframe's own `load`
  // event only means its HTML/JS document loaded, not that the WASM app is
  // ready, so the actual re-arm is a best-effort delay (below), not a real
  // ready signal -- there's no postMessage handshake for it in
  // `integration.js`.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setSurferReady(false);
  }

  useEffect(() => {
    if (!surferReady) return;
    sendTheme(appTheme);
  }, [surferReady, appTheme, sendTheme]);

  useEffect(() => {
    let cancelled = false;

    fetch(vcdUrl)
      .then((res) => res.text())
      .then((text) => {
        if (cancelled) return;
        const params = new URLSearchParams({ load_url: vcdUrl });
        // Objects panel "click a signal" -> best-effort focus: reuses this
        // same proven `scope_add_recursive` startup command, targeting the
        // clicked signal's own containing scope (dropping its leaf name)
        // rather than the file's top scope, when one was clicked. Surfer
        // doesn't expose a documented API for this beyond what
        // `extractTopScopeName` already relies on, so this is a best-effort
        // sync, not a verified one -- worst case it's a no-op inside Surfer.
        const focusedScope = focusedSignalPath?.split(".").slice(0, -1).join(".");
        const scopeToExpand = focusedScope || extractTopScopeName(text);
        if (scopeToExpand) params.set("startup_commands", `scope_add_recursive ${scopeToExpand}`);
        setSrc(`/surfer/index.html?${params.toString()}`);
      })
      .catch(() => {
        // Couldn't read the VCD to find a scope name -- still load it, just
        // without auto-selecting variables (falls back to the old behavior).
        if (!cancelled) setSrc(`/surfer/index.html?${new URLSearchParams({ load_url: vcdUrl })}`);
      });

    return () => {
      cancelled = true;
    };
  }, [vcdUrl, focusedSignalPath]);

  if (!src) return null;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="Waveform viewer"
      className="h-full w-full border-0"
      onLoad={() => setTimeout(() => setSurferReady(true), 1200)}
    />
  );
}

/** Decorative empty-state illustration (a stylized digital waveform trace)
 * shown instead of plain text when no simulation has produced a waveform
 * yet -- purely cosmetic, no diagnostic meaning. */
function WaveformIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 24h10V10h10v28h10V16h10v22h10V8h10v30h10V18h10v12h12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusGlyph(status: "running" | "completed" | "failed" | "terminated"): string {
  if (status === "completed") return "✔ "; // ✔
  if (status === "running") return "… "; // …
  return "✖ "; // ✘
}

/** Reads the Simulation Manager directly rather than taking a `waveformUrl`
 * prop -- this is what lets the panel switch between every previously-run
 * testbench's waveform instantly (no rerun, no refetch of anything but the
 * already-produced VCD) while a single Run/Run All keeps driving the store
 * from wherever execution is orchestrated (see page.tsx). */
export default function WaveformPanel() {
  const sessions = useSimulationStore((s) => s.sessions);
  const activeSessionId = useSimulationStore((s) => s.activeSessionId);
  const setActiveSession = useSimulationStore((s) => s.setActiveSession);
  const focusedSignalPath = useSimulationStore((s) => s.focusedSignalPath);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const waveformUrl = activeSession?.waveformUrl ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-panel-border bg-terminal-bg shadow-panel">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-panel-border bg-surface-sunken px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-medium tracking-wide text-text-secondary">Waveform</span>
          {sessions.length > 0 && (
            <div className="relative min-w-0">
              <select
                value={activeSessionId ?? ""}
                onChange={(e) => setActiveSession(e.target.value || null)}
                aria-label="Select simulation"
                title="Switch between generated simulations"
                className="max-w-[220px] appearance-none truncate rounded-md border border-panel-border bg-surface-1 py-1 pl-2 pr-6 text-xs text-text-primary outline-none transition-colors duration-200 hover:border-text-muted focus:border-accent"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {statusGlyph(s.status)}
                    {s.testbenchName}
                  </option>
                ))}
              </select>
              <IconChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsPopupOpen(true)}
            disabled={!waveformUrl}
            aria-label="Expand waveform"
            title="Expand waveform"
            className={`rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary ${
              !waveformUrl ? "cursor-not-allowed opacity-40" : ""
            }`}
          >
            <IconExpand className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Waveform settings"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
          >
            <IconSettings className="h-3.5 w-3.5" />
          </button>
          <a
            href={waveformUrl ?? undefined}
            aria-label="Download waveform"
            aria-disabled={!waveformUrl}
            download
            className={`rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary ${
              !waveformUrl ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <IconDownload className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {waveformUrl ? (
          <SurferFrame key={waveformUrl} vcdUrl={waveformUrl} focusedSignalPath={focusedSignalPath} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-text-muted">
            <WaveformIllustration className="h-16 w-24 text-border-subtle" />
            <span>
              {activeSession?.status === "running"
                ? `Running ${activeSession.testbenchName}...`
                : "No waveform available"}
            </span>
          </div>
        )}
      </div>

      {isPopupOpen && waveformUrl && (
        <WaveformPopup vcdUrl={waveformUrl} focusedSignalPath={focusedSignalPath} onClose={() => setIsPopupOpen(false)} />
      )}
    </div>
  );
}

function WaveformPopup({
  vcdUrl,
  focusedSignalPath,
  onClose,
}: {
  vcdUrl: string;
  focusedSignalPath: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Waveform viewer"
        className="flex h-full max-h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-lg border border-panel-border bg-terminal-bg shadow-elevated"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-sunken px-4 py-2.5">
          <span className="text-xs font-semibold tracking-wide text-text-secondary">WAVEFORM</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close waveform viewer"
            className="rounded-md p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SurferFrame key={vcdUrl} vcdUrl={vcdUrl} focusedSignalPath={focusedSignalPath} />
        </div>
      </div>
    </div>
  );
}
