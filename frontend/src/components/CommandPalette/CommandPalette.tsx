"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useExplorerStore } from "@/store/explorerStore";
import { useEditorStore } from "@/store/editorStore";
import { useSaveAllFiles } from "@/hooks/useSaveAllFiles";
import { useExportProject } from "@/hooks/useExportProject";
import { buildWorkspaceSymbolIndex } from "@/services/analysis/workspaceSymbolIndex";
import { fuzzyMatch } from "@/services/search/fuzzyMatch";
import { editorManager } from "@/services/editor/EditorManager";
import type { FileNodeData, FolderNodeData, TreeNode } from "@/types/explorer";
import { IconDocument, IconExport, IconKeyboard, IconPlay, IconSave, IconStop } from "@/components/icons";
import { IconSearch } from "@/components/Explorer/icons";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onRun: () => void;
  onStop: () => void;
  isRunning: boolean;
  onOpenShortcutHelp: () => void;
}

type Section = "Commands" | "Files" | "Modules & Signals" | "Recent Files";

interface PaletteItem {
  id: string;
  section: Section;
  label: string;
  sublabel?: string;
  icon: ReactNode;
  run: () => void;
}

const SECTION_ORDER: Section[] = ["Commands", "Files", "Modules & Signals", "Recent Files"];

const SYMBOL_KIND_GLYPH: Record<string, string> = {
  module: "M",
  entity: "E",
  architecture: "A",
  function: "F",
  task: "T",
  process: "P",
  signal: "S",
};

function flattenFiles(nodes: Record<string, TreeNode>, rootId: string): { id: string; relativePath: string }[] {
  const root = nodes[rootId] as FolderNodeData | undefined;
  if (!root) return [];
  const out: { id: string; relativePath: string }[] = [];
  const walk = (id: string, prefix: string) => {
    const node = nodes[id];
    if (!node) return;
    if (node.kind === "folder") node.children.forEach((cid) => walk(cid, `${prefix}${node.name}/`));
    else out.push({ id, relativePath: `${prefix}${node.name}` });
  };
  root.children.forEach((cid) => walk(cid, ""));
  return out;
}

/** Ctrl+P "Search Everywhere" -- a unified, VS Code-style floating palette
 * over Files, Modules & Signals, Commands, and Recent Files. Reuses (never
 * reimplements) each source: the Explorer's file tree, the exact same
 * `buildWorkspaceSymbolIndex`/`fuzzyMatch` the sidebar's Search Symbols panel
 * uses (so results/ranking match between the two), `useSaveAllFiles`/
 * `useExportProject`, `explorerStore.recentFileIds`, and the Run/Stop
 * handlers threaded down from the IDE shell. The symbol index is only built
 * while the palette is actually open (see the `open`-gated `useMemo` below)
 * -- it must not reparse every HDL file in the workspace on every keystroke
 * typed elsewhere while the palette is closed. */
export default function CommandPalette({ open, onClose, onRun, onStop, isRunning, onOpenShortcutHelp }: CommandPaletteProps) {
  const nodes = useExplorerStore((s) => s.nodes);
  const rootId = useExplorerStore((s) => s.rootId);
  const recentFileIds = useExplorerStore((s) => s.recentFileIds);
  const openExplorerFile = useExplorerStore((s) => s.openFile);
  const setActivityView = useExplorerStore((s) => s.setActivityView);
  const openEditorTab = useEditorStore((s) => s.openFile);
  const { saveAll } = useSaveAllFiles();
  const { exportProject } = useExportProject();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the query/selection whenever the palette (re)opens, and reset just
  // the selection whenever the query changes -- both adjusted during render
  // (React's documented pattern for state derived from a changed prop/state)
  // rather than in an effect, so there's no stale-then-reset flash.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Rebuilt only when the palette opens against a changed tree -- never per
  // keystroke of the query (see module doc).
  const symbolIndex = useMemo(() => (open ? buildWorkspaceSymbolIndex(nodes, rootId) : []), [open, nodes, rootId]);

  const openFile = (fileId: string, line?: number) => {
    const node = nodes[fileId];
    if (!node || node.kind !== "file") return;
    openExplorerFile(fileId);
    openEditorTab(fileId);
    if (line) {
      const opened = editorManager.revealLocation(fileId, { lineNumber: line, column: 1 });
      if (opened) editorManager.flashLine(fileId, line);
    }
    onClose();
  };

  const items = useMemo<PaletteItem[]>(() => {
    const commands: PaletteItem[] = [
      {
        id: "cmd-save",
        section: "Commands",
        label: "Save All Files",
        sublabel: "Ctrl+S",
        icon: <IconSave className="h-4 w-4" />,
        run: () => {
          saveAll();
          onClose();
        },
      },
      {
        id: "cmd-export",
        section: "Commands",
        label: "Export Project",
        sublabel: "Ctrl+Shift+E",
        icon: <IconExport className="h-4 w-4" />,
        run: () => {
          void exportProject();
          onClose();
        },
      },
      isRunning
        ? {
            id: "cmd-stop",
            section: "Commands",
            label: "Stop Simulation",
            icon: <IconStop className="h-4 w-4" />,
            run: () => {
              onStop();
              onClose();
            },
          }
        : {
            id: "cmd-run",
            section: "Commands",
            label: "Run Simulation",
            sublabel: "Ctrl+R",
            icon: <IconPlay className="h-4 w-4" />,
            run: () => {
              onRun();
              onClose();
            },
          },
      {
        id: "cmd-search",
        section: "Commands",
        label: "Search Symbols",
        sublabel: "Ctrl+Shift+F",
        icon: <IconSearch className="h-4 w-4" />,
        run: () => {
          setActivityView("search");
          onClose();
        },
      },
      {
        id: "cmd-shortcuts",
        section: "Commands",
        label: "Keyboard Shortcuts",
        sublabel: "Ctrl+/",
        icon: <IconKeyboard className="h-4 w-4" />,
        run: () => {
          onOpenShortcutHelp();
          onClose();
        },
      },
    ];

    const files: PaletteItem[] = flattenFiles(nodes, rootId).map((f) => ({
      id: `file-${f.id}`,
      section: "Files",
      label: f.relativePath.split("/").pop() ?? f.relativePath,
      sublabel: f.relativePath,
      icon: <IconDocument className="h-4 w-4" />,
      run: () => openFile(f.id),
    }));

    const symbols: PaletteItem[] = symbolIndex.map((s) => ({
      id: `sym-${s.id}`,
      section: "Modules & Signals",
      label: s.name,
      sublabel: `${s.relativePath}:${s.line}`,
      icon: (
        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-surface-hover text-[10px] font-semibold text-accent">
          {SYMBOL_KIND_GLYPH[s.kind] ?? "?"}
        </span>
      ),
      run: () => openFile(s.fileId, s.line),
    }));

    const recent: PaletteItem[] = recentFileIds
      .map((id) => nodes[id])
      .filter((n): n is FileNodeData => !!n && n.kind === "file")
      .map((n) => ({
        id: `recent-${n.id}`,
        section: "Recent Files",
        label: n.name,
        icon: <IconDocument className="h-4 w-4" />,
        run: () => openFile(n.id),
      }));

    return [...commands, ...files, ...symbols, ...recent];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, rootId, recentFileIds, symbolIndex, isRunning]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.filter((i) => i.section === "Commands" || i.section === "Recent Files");
    return items
      .map((item) => ({ item, match: fuzzyMatch(query, item.label) }))
      .filter((r): r is { item: PaletteItem; match: NonNullable<typeof r.match> } => r.match !== null)
      .sort((a, b) => b.match.score - a.match.score)
      .map((r) => r.item)
      .slice(0, 100);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[activeIndex]?.run();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search Everywhere"
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-panel-border bg-surface-1 shadow-elevated"
      >
        <div className="flex items-center gap-2 border-b border-panel-border px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, modules, signals, commands…"
            aria-label="Search Everywhere"
            className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="shrink-0 rounded border border-panel-border px-1.5 py-0.5 text-[10px] text-text-muted">Esc</kbd>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">No results.</p>
          ) : (
            SECTION_ORDER.map((section) => {
              const sectionItems = filtered.filter((i) => i.section === section);
              if (sectionItems.length === 0) return null;
              return (
                <div key={section} className="mb-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {section}
                  </div>
                  {sectionItems.map((item) => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.run}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-100 ${
                          active ? "bg-surface-selected text-text-primary" : "text-text-secondary hover:bg-surface-hover"
                        }`}
                      >
                        <span className="shrink-0 text-text-muted">{item.icon}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-text-primary">{item.label}</span>
                          {item.sublabel && <span className="ml-2 truncate text-[10px] text-text-muted">{item.sublabel}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
