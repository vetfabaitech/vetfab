"use client";

import { ReactNode, useCallback, useRef, useState } from "react";
import ResizableLayout from "@/components/ResizableLayout";
import { useRightPanelStore, type RightPanelMode } from "@/store/panelStore";
import { IconPanelCollapseRight, IconPanelExpandRight } from "@/components/icons";

interface CollapsibleRightPanelProps {
  output: ReactNode;
  waveform: ReactNode;
  /** Small-screen responsive override (Feature 3's "auto-collapse on small
   * screens") -- collapses the panel regardless of the user's own
   * collapsed/expanded preference, without overwriting that preference, so
   * widening the window back out restores whatever the user had chosen. */
  forceCollapsed: boolean;
}

const MODES: { value: RightPanelMode; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "output", label: "Simulation Output" },
  { value: "waveform", label: "Waveform" },
];

/** Collapsible/resizable wrapper around the Output + Waveform column
 * (Feature 3). Reuses the existing `ResizableLayout` unchanged for the
 * Output/Waveform internal split when both are shown -- this component only
 * adds an outer collapse/width dimension around it, via the same
 * pointer-drag resize pattern `Sidebar.tsx` already uses for the explorer
 * width. Width is remembered in `useRightPanelStore` (localStorage); the
 * editor column is a plain flexbox sibling in `page.tsx`; so collapsing this
 * panel to a thin rail automatically hands its space back to the editor with
 * no separate "expand editor" logic needed. */
export default function CollapsibleRightPanel({ output, waveform, forceCollapsed }: CollapsibleRightPanelProps) {
  const collapsed = useRightPanelStore((s) => s.collapsed);
  const width = useRightPanelStore((s) => s.width);
  const mode = useRightPanelStore((s) => s.mode);
  const toggleCollapsed = useRightPanelStore((s) => s.toggleCollapsed);
  const setWidth = useRightPanelStore((s) => s.setWidth);
  const setMode = useRightPanelStore((s) => s.setMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isCollapsed = collapsed || forceCollapsed;

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      // Width is measured from the pointer to the panel's own right edge
      // (not the window edge) so this keeps working if the panel is ever
      // nested inside something narrower than the full viewport.
      const rect = containerRef.current?.parentElement?.getBoundingClientRect();
      if (!rect) return;
      setWidth(rect.right - e.clientX);
    },
    [isDragging, setWidth]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  if (isCollapsed) {
    return (
      <div className="flex h-full w-9 shrink-0 flex-col items-center gap-2 border-l border-panel-border bg-surface-sunken py-2 transition-[width] duration-200 ease-out">
        <button
          type="button"
          onClick={toggleCollapsed}
          disabled={forceCollapsed}
          aria-label="Expand Output/Waveform panel"
          aria-expanded={false}
          title="Expand panel"
          className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconPanelExpandRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full shrink-0 flex-col overflow-hidden border-l border-panel-border ${
        isDragging ? "" : "transition-[width] duration-200 ease-out"
      }`}
      style={{ width, minWidth: 260 }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Output/Waveform panel"
        className={`absolute left-0 top-0 z-10 h-full w-1 shrink-0 cursor-col-resize touch-none select-none transition-colors ${
          isDragging ? "bg-accent" : "bg-transparent hover:bg-accent/70"
        }`}
      />

      <div className="flex h-8 shrink-0 items-center justify-between border-b border-panel-border bg-surface-sunken px-2 pl-3">
        <div role="tablist" aria-label="Panel display mode" className="flex items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`rounded px-2 py-0.5 text-[11px] outline-none transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
                mode === m.value ? "bg-surface-hover text-text-primary" : "text-text-muted hover:bg-surface-2 hover:text-text-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse Output/Waveform panel"
          aria-expanded={true}
          title="Collapse panel"
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <IconPanelCollapseRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-app-bg">
        {mode === "both" && (
          <ResizableLayout
            direction="column"
            defaultPercent={42}
            minFirstPx={120}
            minSecondPx={160}
            first={<div className="h-full p-2 pb-1">{output}</div>}
            second={<div className="h-full p-2 pt-1">{waveform}</div>}
          />
        )}
        {mode === "output" && <div className="h-full p-2">{output}</div>}
        {mode === "waveform" && <div className="h-full p-2">{waveform}</div>}
      </div>
    </div>
  );
}
