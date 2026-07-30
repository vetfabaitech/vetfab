"use client";

import { IconShare, IconSpinner } from "@/components/icons";
import ToolbarIconButton from "./ToolbarIconButton";

interface ShareButtonProps {
  onClick: () => void;
  isSharing: boolean;
}

export default function ShareButton({ onClick, isSharing }: ShareButtonProps) {
  return (
    <ToolbarIconButton label="Share Project" onClick={onClick} disabled={isSharing}>
      {isSharing ? <IconSpinner className="h-[18px] w-[18px]" /> : <IconShare className="h-[18px] w-[18px]" />}
    </ToolbarIconButton>
  );
}
