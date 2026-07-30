"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { LogEntry } from "@/lib/types";
import { useSaveAllFiles } from "@/hooks/useSaveAllFiles";
import { useExportProject } from "@/hooks/useExportProject";
import { COMMANDS, findCommand, type CommandContext } from "@/services/commands/commandRegistry";
import LogList from "@/components/shared/LogList";
import { IconSpinner } from "@/components/icons";

interface CommandConsoleProps {
  onRun: () => void;
  onStop: () => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `console-${idCounter}`;
}

function makeEntry(text: string, level: LogEntry["level"] = "info"): LogEntry {
  return { id: nextId(), text, level, timestamp: Date.now() };
}

/** Vivado Tcl Console-style "Command Console" tab: input with history
 * (Up/Down), scrollable color-coded output (via the shared `LogList`), and a
 * loading indicator while a command runs. There is no Tcl interpreter or
 * structured-command backend anywhere in this app (confirmed before writing
 * this) -- every command here dispatches to the app's own existing
 * Run/Stop/Save/Export actions (see `commandRegistry.ts`), the same honest
 * scope the Debug Toolbar's disabled Pause/Step/Continue buttons take. The
 * command shape is intentionally backend-agnostic so a future Tcl/simulator
 * command server can be dropped in behind `findCommand`/`run` without
 * touching this component. */
export default function CommandConsole({ onRun, onStop }: CommandConsoleProps) {
  const { saveAll } = useSaveAllFiles();
  const { exportProject } = useExportProject();
  const [entries, setEntries] = useState<LogEntry[]>([
    makeEntry(`Command Console ready. Type "help" for a list of commands.`),
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx: CommandContext = { onRun, onStop, onSaveAll: saveAll, onExport: exportProject };

  const firstWord = input.trim().split(/\s+/)[0] ?? "";
  const isKnownCommand = firstWord === "" || firstWord === "clear" || !!findCommand(firstWord);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isExecuting) return;

    setEntries((prev) => [...prev, makeEntry(`> ${trimmed}`)]);
    setHistory((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]));
    setHistoryIndex(null);
    setInput("");

    const [name, ...args] = trimmed.split(/\s+/);
    if (name.toLowerCase() === "clear") {
      setEntries([]);
      return;
    }

    const command = findCommand(name);
    if (!command) {
      setEntries((prev) => [...prev, makeEntry(`Unknown command: "${name}". Type "help" for a list.`, "error")]);
      return;
    }

    setIsExecuting(true);
    try {
      const results = await command.run(args, ctx);
      if (results.length > 0) {
        setEntries((prev) => [...prev, ...results.map((r) => makeEntry(r.text, r.level))]);
      }
    } catch (err) {
      setEntries((prev) => [...prev, makeEntry(err instanceof Error ? err.message : "Command failed", "error")]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput("");
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-editor-bg">
      <LogList entries={entries} onClear={() => setEntries([])} showSearch emptyMessage="No console output yet." />
      <div className="flex shrink-0 items-center gap-2 border-t border-panel-border px-3 py-2 font-mono text-[13px]">
        <span className="shrink-0 text-accent">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          placeholder={`Type a command… (${COMMANDS.map((c) => c.name).join(", ")}, clear)`}
          aria-label="Command input"
          spellCheck={false}
          className={`w-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted disabled:opacity-60 ${
            input.trim() === "" ? "text-text-primary" : isKnownCommand ? "text-accent" : "text-error"
          }`}
        />
        {isExecuting && <IconSpinner className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
      </div>
    </div>
  );
}
