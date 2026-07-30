import { IconAlertTriangle, IconCheck } from "@/components/icons";

interface FileStatusBadgeProps {
  hasError: boolean;
  dirty: boolean;
  compiled: boolean;
}

/** Single-glyph file status indicator for the Explorer (Feature 2). Only one
 * badge shows at a time, by priority: Errors > Modified (unsaved) > Compiled
 * > Normal (nothing) -- matching VS Code's own "worst status wins" rule so
 * the tree stays scannable instead of noisy. Files only; folders never show
 * a badge (enforced by the caller, `TreeRow.tsx`). */
export default function FileStatusBadge({ hasError, dirty, compiled }: FileStatusBadgeProps) {
  if (hasError) {
    return (
      <span role="img" aria-label="Contains errors" title="Contains errors" className="shrink-0">
        <IconAlertTriangle className="h-3 w-3 text-error" />
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        role="img"
        aria-label="Modified, unsaved changes"
        title="Modified (unsaved)"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary"
      />
    );
  }
  if (compiled) {
    return (
      <span role="img" aria-label="Compiled successfully" title="Compiled successfully" className="shrink-0">
        <IconCheck className="h-3 w-3 text-success" />
      </span>
    );
  }
  return null;
}
