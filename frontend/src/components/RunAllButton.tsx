"use client";

import { IconPlay, IconSpinner } from "./icons";

interface RunAllButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

/** Sequentially executes every detected testbench, storing one simulation
 * session (and one waveform) per testbench in the Simulation Manager --
 * distinct from "Run", which only executes the currently selected testbench. */
export default function RunAllButton({ onClick, isLoading }: RunAllButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      title="Run every detected testbench sequentially"
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-4 text-sm font-medium text-accent shadow-sm transition-all duration-200 hover:bg-accent/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
    >
      {isLoading ? <IconSpinner className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
      <span>{isLoading ? "Running All..." : "Run All"}</span>
    </button>
  );
}
