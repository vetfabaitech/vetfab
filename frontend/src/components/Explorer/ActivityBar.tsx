"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ActivityView } from "@/types/explorer";
import { useExplorerStore } from "@/store/explorerStore";
import { IconFilesActivity, IconGitBranch, IconSearch } from "./icons";
import type { ComponentType } from "react";

interface ActivityItem {
  id: ActivityView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const ITEMS: ActivityItem[] = [
  { id: "explorer", label: "Explorer", icon: IconFilesActivity },
  { id: "search", label: "Search", icon: IconSearch },
  { id: "scm", label: "Source Control", icon: IconGitBranch },
];

export default function ActivityBar() {
  const activityView = useExplorerStore((s) => s.activityView);
  const setActivityView = useExplorerStore((s) => s.setActivityView);
  const [hovered, setHovered] = useState<ActivityView | null>(null);

  return (
    <nav
      aria-label="Activity Bar"
      className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-panel-border bg-sidebar-bg py-3"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activityView === id;
        return (
          <div key={id} className="relative">
            <button
              type="button"
              onClick={() => setActivityView(id)}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(id)}
              onBlur={() => setHovered(null)}
              aria-label={label}
              aria-pressed={active}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? "text-accent" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="activity-active-pill"
                  className="absolute inset-0 rounded-lg bg-surface-selected"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className="relative h-[18px] w-[18px]" />
            </button>

            {hovered === id && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-panel-border bg-surface-1 px-2 py-1 text-xs font-medium text-text-primary shadow-elevated"
              >
                {label}
              </motion.div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
