"use client";

import { useCallback, useRef } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import ActivityBar from "./ActivityBar";
import Explorer from "./Explorer";
import SearchSymbolsPanel from "./SearchSymbolsPanel";
import { IconGitBranch, IconSearch } from "./icons";

function PlaceholderPanel({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof IconSearch;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center px-4 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon className="h-8 w-8 text-text-muted" />
        <p className="text-xs leading-relaxed text-text-muted">{copy}</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const activityView = useExplorerStore((s) => s.activityView);
  const sidebarWidth = useExplorerStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useExplorerStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useExplorerStore((s) => s.setSidebarWidth);

  const draggingRef = useRef(false);

  // Store hydration (restoring the persisted workspace from localStorage) is
  // handled once, up front, by the render gate in app/page.tsx via
  // useStoresHydrated -- so this component no longer kicks it off itself.

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const container = e.currentTarget.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setSidebarWidth(e.clientX - rect.left);
    },
    [setSidebarWidth]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div className="flex h-full shrink-0 overflow-hidden bg-sidebar-bg">
      <ActivityBar />

      {!sidebarCollapsed && (
        <div
          className="relative flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-panel-border bg-sidebar-bg"
          style={{ width: sidebarWidth }}
        >
          {activityView === "explorer" && <Explorer />}
          {activityView === "search" && <SearchSymbolsPanel />}
          {activityView === "scm" && (
            <PlaceholderPanel
              icon={IconGitBranch}
              title="Source Control"
              copy="Source control integration is coming soon."
            />
          )}

          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            className="absolute right-0 top-0 z-10 h-full w-1 shrink-0 cursor-col-resize touch-none select-none bg-transparent transition-colors duration-200 hover:bg-accent/70"
          />
        </div>
      )}
    </div>
  );
}
