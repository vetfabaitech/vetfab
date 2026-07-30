export function Divider({ label = "OR" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      <span className="shrink-0 text-xs font-medium tracking-wide text-neutral-400 dark:text-neutral-500">{label}</span>
      <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
