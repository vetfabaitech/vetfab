"use client";

import { IconStop } from "./icons";

interface StopButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export default function StopButton({ onClick, disabled }: StopButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-error/30 bg-error/10 px-4 text-sm font-medium text-error shadow-sm transition-all duration-200 hover:bg-error/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
    >
      <IconStop className="h-3 w-3" />
      <span>Stop</span>
    </button>
  );
}
