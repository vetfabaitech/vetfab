/** Abstract chip/IC mark -- two "pins" over a die, standing in for a real
 * product mark. Swap for the actual HDL WebIDE logo asset when available;
 * every place this is used only assumes a square aspect ratio. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" className="fill-brand-500" />
      <path d="M10 11h4v10h-4z" fill="white" />
      <path d="M18 11h4v10h-4z" fill="white" fillOpacity="0.55" />
    </svg>
  );
}
