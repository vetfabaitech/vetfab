"use client";

import { ReactNode, useRef, useState } from "react";

interface ResizableLayoutProps {
  direction: "row" | "column";
  first: ReactNode;
  second: ReactNode;
  defaultPercent: number;
  minFirstPx?: number;
  minSecondPx?: number;
  /** Overrides the split percentage (e.g. a panel's "maximize" toggle)
   * without touching the user's own dragged `percent` -- restoring it (by
   * going back to `undefined`) snaps back to wherever they last left the
   * splitter, since the internal drag state was never overwritten. Bypasses
   * `minFirstPx`/`minSecondPx`'s drag-time clamp by design (those only guard
   * pointer-drag math below); the panes' own `minWidth`/`minHeight` styles
   * still apply, so "maximize" leaves a `minFirstPx`/`minSecondPx` sliver of
   * the other pane rather than being pixel-perfect fullscreen. */
  forcedPercent?: number;
}

export default function ResizableLayout({
  direction,
  first,
  second,
  defaultPercent,
  minFirstPx = 180,
  minSecondPx = 180,
  forcedPercent,
}: ResizableLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(defaultPercent);
  const [isDragging, setIsDragging] = useState(false);
  const isRow = direction === "row";
  const effectivePercent = forcedPercent ?? percent;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (forcedPercent !== undefined) return; // maximized -- dragging is a no-op until restored
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || forcedPercent !== undefined) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const size = isRow ? rect.width : rect.height;
    const offset = isRow ? e.clientX - rect.left : e.clientY - rect.top;
    const minPercent = (minFirstPx / size) * 100;
    const maxPercent = 100 - (minSecondPx / size) * 100;
    const raw = (offset / size) * 100;
    setPercent(Math.min(maxPercent, Math.max(minPercent, raw)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 ${isRow ? "flex-row" : "flex-col"} overflow-hidden h-full w-full`}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
        style={
          isRow
            ? { width: `${effectivePercent}%`, minWidth: minFirstPx }
            : { height: `${effectivePercent}%`, minHeight: minFirstPx }
        }
      >
        {first}
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="separator"
        aria-orientation={isRow ? "vertical" : "horizontal"}
        aria-label="Resize panels"
        className={`relative z-10 shrink-0 touch-none select-none bg-panel-border transition-colors duration-200 ${
          forcedPercent !== undefined ? "cursor-default" : isRow ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
        } ${isDragging ? "bg-accent" : "hover:bg-accent"}`}
      />

      <div
        className="min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col h-full w-full"
        style={isRow ? { minWidth: minSecondPx } : { minHeight: minSecondPx }}
      >
        {second}
      </div>
    </div>
  );
}
