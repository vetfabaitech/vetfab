"use client";

import { IconImport } from "@/components/icons";
import ToolbarIconButton from "./ToolbarIconButton";

interface ImportButtonProps {
  onClick: () => void;
}

export default function ImportButton({ onClick }: ImportButtonProps) {
  return (
    <ToolbarIconButton label="Import Project" shortcutHint="Ctrl+Shift+O" onClick={onClick}>
      <IconImport className="h-[18px] w-[18px]" />
    </ToolbarIconButton>
  );
}
