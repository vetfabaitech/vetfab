import { IconDocument } from "@/components/icons";
import { extname } from "@/utils/format";
import { IconArchive, IconFolderClosed, IconFolderOpen, IconWorkspace } from "./icons";

interface BadgeSpec {
  label: string;
  color: string;
}

const BADGES: Record<string, BadgeSpec> = {
  v: { label: "V", color: "#4ade80" },
  sv: { label: "SV", color: "#2dd4bf" },
  svh: { label: "SVH", color: "#14b8a6" },
  vhd: { label: "VHD", color: "#a78bfa" },
  vhdl: { label: "VHDL", color: "#8b5cf6" },
  do: { label: "DO", color: "#fb923c" },
  tcl: { label: "TCL", color: "#f97316" },
  mem: { label: "MEM", color: "#38bdf8" },
  hex: { label: "HEX", color: "#0ea5e9" },
  coe: { label: "COE", color: "#0284c7" },
  json: { label: "{ }", color: "#facc15" },
  yaml: { label: "YML", color: "#f472b6" },
  yml: { label: "YML", color: "#f472b6" },
  toml: { label: "TML", color: "#fb7185" },
  md: { label: "M↓", color: "#60a5fa" },
  txt: { label: "TXT", color: "#9ca3af" },
  pdf: { label: "PDF", color: "#f87171" },
};

const SIZE_PX: Record<"small" | "medium" | "large", number> = {
  small: 14,
  medium: 18,
  large: 22,
};

interface FileIconProps {
  name: string;
  kind: "file" | "folder";
  isOpen?: boolean;
  isRoot?: boolean;
  iconSize?: "small" | "medium" | "large";
  className?: string;
}

export default function FileIcon({ name, kind, isOpen, isRoot, iconSize = "medium", className }: FileIconProps) {
  const px = SIZE_PX[iconSize];

  if (isRoot) {
    return <IconWorkspace className={className} style={{ width: px + 2, height: px + 2 }} />;
  }

  if (kind === "folder") {
    const Icon = isOpen ? IconFolderOpen : IconFolderClosed;
    return (
      <Icon
        className={className}
        style={{ width: px + 2, height: px + 2, color: "#e8ab4e" }}
      />
    );
  }

  const ext = extname(name);
  if (ext === "zip") {
    return <IconArchive className={className} style={{ width: px, height: px, color: "#eab308" }} />;
  }

  const badge = BADGES[ext];
  if (!badge) {
    return <IconDocument className={className} style={{ width: px, height: px, color: "#9ca3af" }} />;
  }

  const fontSize = iconSize === "small" ? 6.5 : iconSize === "large" ? 8.5 : 7.5;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] font-bold leading-none tracking-tighter ${className ?? ""}`}
      style={{
        height: px,
        minWidth: px,
        paddingInline: 2,
        fontSize,
        color: badge.color,
        background: `${badge.color}26`,
        border: `1px solid ${badge.color}40`,
      }}
    >
      {badge.label}
    </span>
  );
}
