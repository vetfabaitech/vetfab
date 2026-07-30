"use client";

import { useExplorerStore } from "@/store/explorerStore";
import { IconClose } from "@/components/icons";
import { IconSearch } from "./icons";

export default function ExplorerSearch() {
  const searchQuery = useExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useExplorerStore((s) => s.setSearchQuery);

  return (
    <div className="shrink-0 border-b border-panel-border px-2.5 py-2">
      <div className="flex items-center gap-1.5 rounded-full border border-transparent bg-surface-hover px-3 py-1.5 transition-colors duration-200 focus-within:border-accent/40 focus-within:bg-surface-1">
        <IconSearch className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files… (try *.sv)"
          aria-label="Search files in explorer"
          className="min-w-0 flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted/70 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery("")}
            className="shrink-0 rounded p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <IconClose className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
