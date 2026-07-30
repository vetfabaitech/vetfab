import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Rendered inside the input's right edge -- e.g. PasswordInput's
   * show/hide toggle. Kept generic so FormField stays reusable for any
   * future field that needs a trailing control. */
  trailingAction?: ReactNode;
}

/** Label + input + inline error, fully wired for a11y: the label is a real
 * <label htmlFor>, the error is announced via aria-describedby + role="alert"
 * (so screen readers pick it up the moment validation fails, not just on
 * next tab-through), and aria-invalid reflects validity state for assistive
 * tech and browser/OS form-fill heuristics alike. */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, trailingAction, id, className, ...inputProps },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "w-full rounded-control border bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm transition-colors duration-150",
            "placeholder:text-neutral-400",
            "focus:outline-none focus-visible:border-brand-500 focus-visible:shadow-focus-glow",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "dark:bg-neutral-900 dark:text-neutral-50",
            error
              ? "border-red-400 focus-visible:border-red-500 focus-visible:shadow-none focus-visible:ring-4 focus-visible:ring-red-500/15 dark:border-red-500/70"
              : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600",
            trailingAction && "pr-11",
            className
          )}
          {...inputProps}
        />
        {trailingAction && <div className="absolute inset-y-0 right-0 flex items-center pr-2.5">{trailingAction}</div>}
      </div>
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
});
