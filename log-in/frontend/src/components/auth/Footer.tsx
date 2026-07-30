import { useToast } from "@/hooks/useToast";

/** Every link here is intentionally inert -- this is a UI preview with no
 * routing installed yet (see the top-level README). Clicking surfaces a
 * clear "not wired up" toast rather than a silent no-op or a dead `#`
 * link, so it's obvious in review that this is deliberate, not broken. */
export function Footer() {
  const { showToast } = useToast();

  const notify = (label: string) =>
    showToast({ variant: "info", title: "Preview only", description: `${label} isn't wired up in this UI preview yet.` });

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={() => notify("Create Account")}
          className="font-semibold text-brand-600 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-brand-400 dark:hover:text-brand-300 dark:focus-visible:ring-offset-neutral-950"
        >
          Create Account
        </button>
      </p>
      <div className="flex items-center gap-4 text-xs text-neutral-400 dark:text-neutral-500">
        <button
          type="button"
          onClick={() => notify("Privacy Policy")}
          className="transition-colors duration-150 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-neutral-300"
        >
          Privacy Policy
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => notify("Terms of Service")}
          className="transition-colors duration-150 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-neutral-300"
        >
          Terms of Service
        </button>
      </div>
    </div>
  );
}
