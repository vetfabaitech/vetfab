"use client";

import { IconPlay, IconSpinner } from "./icons";

interface RunButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export default function RunButton({ onClick, isLoading }: RunButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-blue-500 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
    >
      {isLoading ? <IconSpinner className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
      <span>{isLoading ? "Running..." : "Run"}</span>
    </button>
  );
}
