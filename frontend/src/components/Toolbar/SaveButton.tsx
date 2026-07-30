"use client";

import { IconSave } from "@/components/icons";
import ToolbarIconButton from "./ToolbarIconButton";

interface SaveButtonProps {
  onClick: () => void;
  disabled: boolean;
}

export default function SaveButton({ onClick, disabled }: SaveButtonProps) {
  return (
    <ToolbarIconButton label="Save All" shortcutHint="Ctrl+S" onClick={onClick} disabled={disabled}>
      <IconSave className="h-[18px] w-[18px]" />
    </ToolbarIconButton>
  );
}
