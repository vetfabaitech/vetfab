"use client";

import { IconExport, IconSpinner } from "@/components/icons";
import ToolbarIconButton from "./ToolbarIconButton";

interface ExportButtonProps {
  onClick: () => void;
  isExporting: boolean;
}

export default function ExportButton({ onClick, isExporting }: ExportButtonProps) {
  return (
    <ToolbarIconButton label="Export Project" shortcutHint="Ctrl+Shift+E" onClick={onClick} disabled={isExporting}>
      {isExporting ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconExport className="h-[18px] w-[18px]" />}
    </ToolbarIconButton>
  );
}
