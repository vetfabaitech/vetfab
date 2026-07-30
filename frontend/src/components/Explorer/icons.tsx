import type { CSSProperties } from "react";

interface IconProps {
  className?: string;
  style?: CSSProperties;
}

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconSearch({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function IconFilesActivity({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconGitBranch({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 8v8M6 8a6 6 0 006 6h4" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20 11a8 8 0 10-2.34 5.66M20 5v6h-6" />
    </svg>
  );
}

export function IconCloudUpload({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 18a4.5 4.5 0 01-.5-8.97A5.5 5.5 0 0117 8.5a4 4 0 01-.5 7.98" />
      <path d="M12 21v-8M9 16l3-3 3 3" />
    </svg>
  );
}

export function IconCollapseAll({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6 9l4-4 4 4M6 19l4-4 4-4" transform="translate(2 0)" />
    </svg>
  );
}

export function IconExpandAll({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6 6l4 4 4-4M6 16l4 4 4-4" transform="translate(2 0)" />
    </svg>
  );
}

export function IconNewFile({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 3h6l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M13 3v4h4" />
      <path d="M10.5 12.5v5M8 15h5" />
    </svg>
  );
}

export function IconNewFolder({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 6a1 1 0 011-1h4l2 2h8a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V6z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

export function IconUpload({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 21V9m0 0l-4 4m4-4l4 4M4 5h16" />
    </svg>
  );
}

export function IconUploadFolder({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 6a1 1 0 011-1h4l2 2h8a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V6z" />
      <path d="M12 17v-6m0 0l-2.3 2.3M12 11l2.3 2.3" />
    </svg>
  );
}

export function IconSort({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 5v14M7 5L4 8M7 5l3 3" />
      <path d="M17 19V5M17 19l-3-3M17 19l3-3" />
    </svg>
  );
}

export function IconMoreHorizontal({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
      <path d="M12 15v5" />
    </svg>
  );
}

export function IconStar({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.6l-5.2 2.9 1-5.8-4.3-4.1 5.9-.8L12 3.5z" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function IconWarning({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export function IconFolderOpen({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 6.5A1.5 1.5 0 014 5h4.5l2 2H19a1.5 1.5 0 011.5 1.5v.5H6.2a1.5 1.5 0 00-1.45 1.13L2.5 18V6.5z" opacity="0.55" />
      <path d="M4.75 11.13A1.5 1.5 0 016.2 10H21a1 1 0 01.97 1.24l-2.1 8.4A1.5 1.5 0 0118.42 20H4a1.5 1.5 0 01-1.45-1.87l2.2-7z" />
    </svg>
  );
}

export function IconFolderClosed({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 5.5A1.5 1.5 0 014 4h4.7l2 2H20a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5v-13z" />
    </svg>
  );
}

export function IconArchive({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} {...base}>
      <rect x="4" y="4" width="16" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

export function IconWorkspace({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} {...base}>
      <path d="M12 3l8 4-8 4-8-4 8-4z" />
      <path d="M4 11l8 4 8-4M4 15l8 4 8-4" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconScissors({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.5 7.5L19 18M8.5 16.5L19 6" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15H4.5A1.5 1.5 0 013 13.5v-9A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5V5" />
    </svg>
  );
}

export function IconClipboard({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
    </svg>
  );
}

export function IconDuplicate({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="7" y="7" width="12" height="14" rx="1.5" />
      <path d="M5 15H4.5A1.5 1.5 0 013 13.5v-9A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5V5" />
    </svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </svg>
  );
}

export function IconGrid({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  );
}
