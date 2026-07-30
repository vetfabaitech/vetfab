export function extname(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function basenameWithoutExt(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return name;
  return name.slice(0, idx);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function isTextExtension(name: string): boolean {
  const ext = extname(name);
  return [
    "v",
    "sv",
    "svh",
    "vhd",
    "vhdl",
    "do",
    "tcl",
    "mem",
    "hex",
    "coe",
    "json",
    "yaml",
    "yml",
    "toml",
    "md",
    "txt",
  ].includes(ext);
}
