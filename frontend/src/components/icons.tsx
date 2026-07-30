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

export function IconChip({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
      <path d="M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2" />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconStop({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

export function IconSpinner({ className }: IconProps) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a1 1 0 01-1 1H8a1 1 0 01-1-1V7h10z" />
    </svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
    </svg>
  );
}

export function IconExpand({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 3H4v5M15 3h5v5M9 21H4v-5M15 21h5v-5" />
    </svg>
  );
}

export function IconCollapse({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function IconDocument({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} {...base}>
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  );
}

export function IconFlask({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 005.8 21h12.4a1.5 1.5 0 001.3-2.5L14 9V3" />
      <path d="M8 15h8" />
    </svg>
  );
}

export function IconMonitor({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 6a1 1 0 011-1h4l2 2h8a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V6z" />
    </svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 4L2.5 20h19L12 4z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function IconSave({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M5 3h11l3 3v14a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M8 3v5h7V3" />
      <path d="M7 21v-7h10v7" />
    </svg>
  );
}

export function IconImport({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3v10m0 0l-3.3-3.3M12 13l3.3-3.3" />
      <path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
    </svg>
  );
}

export function IconExport({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 13V3m0 0l-3.3 3.3M12 3l3.3 3.3" />
      <path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
    </svg>
  );
}

export function IconShare({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </svg>
  );
}

export function IconArrowLeft({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" />
    </svg>
  );
}

export function IconPanelCollapseRight({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M15 4v16" />
      <path d="M11 9l-2 3 2 3" />
    </svg>
  );
}

export function IconPanelExpandRight({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M15 4v16" />
      <path d="M9 9l2 3-2 3" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 8H4V5" />
      <path d="M4 8a8 8 0 111.5 9.5" />
    </svg>
  );
}

export function IconRedo({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M17 8h3V5" />
      <path d="M20 8a8 8 0 10-1.5 9.5" />
    </svg>
  );
}

export function IconHammer({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M14.5 6.5l3 3L9 18l-4 1 1-4z" />
      <path d="M13 8l3.5-3.5a2.12 2.12 0 013 3L16 11" />
    </svg>
  );
}

export function IconFormat({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 6h16M4 12h10M4 18h13" />
      <path d="M19 15v6m0-6l-2.5 2.5M19 15l2.5 2.5" />
    </svg>
  );
}

export function IconWaveformSmall({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2 14h3V8h3v12h3V4h3v16h3V10h3v8h2" />
    </svg>
  );
}

export function IconCommand({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 3a2 2 0 00-2 2v14a2 2 0 104 0v-3M9 3a2 2 0 114 0v3m0 8v3a2 2 0 104 0V9a2 2 0 10-4 0h-4a2 2 0 10-4 0" />
    </svg>
  );
}

export function IconPause({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function IconRestart({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M4 12a8 8 0 0114-5.3M4 12a8 8 0 0014 5.3" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

export function IconStepForward({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5v14l9-7z" />
      <rect x="16" y="5" width="3" height="14" rx="1" />
    </svg>
  );
}

export function IconContinue({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 5v14l8-7z" />
      <path d="M13 5v14l8-7z" />
    </svg>
  );
}

export function IconBreakpointDot({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function IconTerminalPrompt({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  );
}

export function IconTree({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="17" cy="12" r="2" />
      <path d="M5 8v8M5 12h10M13 12l2-2" />
    </svg>
  );
}

export function IconKeyboard({ className }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="2.5" y="6" width="19" height="13" rx="1.5" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M9.5 13.5h.01M13 13.5h.01M16.5 13.5h.01M7 17h10" />
    </svg>
  );
}
