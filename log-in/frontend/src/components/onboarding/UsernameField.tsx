import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { checkUsername, RealAuthError } from "@/lib/realAuth";
import { cn } from "@/lib/utils";

type CheckState = "idle" | "checking" | "available" | "unavailable" | "error";

interface UsernameFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  /** RHF's synchronous format error (regex/length) -- takes priority over
   * the async availability state, since there's no point checking
   * availability of something that's not even a legal username yet. */
  formatError?: string;
  onAvailabilityChange: (available: boolean) => void;
}

const DEBOUNCE_MS = 400;

/** Username input wired to GET /api/v1/user/check-username, debounced so
 * we're not firing a request per keystroke. Mirrors FormField's a11y
 * pattern (aria-describedby + role="alert"/"status") but adds a live
 * availability indicator alongside the format error. */
export const UsernameField = forwardRef<HTMLInputElement, UsernameFieldProps>(function UsernameField(
  { value, onChange, formatError, onAvailabilityChange, id, className, ...inputProps },
  ref
) {
  const [state, setState] = useState<CheckState>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const inputId = id ?? "username";
  const statusId = `${inputId}-status`;

  useEffect(() => {
    if (formatError || !value) {
      setState("idle");
      onAvailabilityChange(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setState("checking");
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkUsername(value);
        if (requestIdRef.current !== requestId) return; // a newer keystroke superseded this check
        setState(result.available ? "available" : "unavailable");
        setReason(result.available ? null : (result.reason ?? "This username isn't available."));
        onAvailabilityChange(result.available);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setState("error");
        setReason(err instanceof RealAuthError ? err.message : "Unable to check availability right now.");
        onAvailabilityChange(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onAvailabilityChange is a stable setter from the parent
  }, [value, formatError]);

  const showError = Boolean(formatError) || state === "unavailable" || state === "error";
  const errorMessage = formatError ?? (showError ? reason : null);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Username
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          aria-invalid={showError}
          aria-describedby={statusId}
          autoComplete="off"
          spellCheck={false}
          placeholder="harsha_dev"
          className={cn(
            "w-full rounded-control border bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm transition-colors duration-150",
            "placeholder:text-neutral-400",
            "focus:outline-none focus-visible:border-brand-500 focus-visible:shadow-focus-glow",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "dark:bg-neutral-900 dark:text-neutral-50",
            "pr-10",
            showError
              ? "border-red-400 focus-visible:border-red-500 focus-visible:shadow-none focus-visible:ring-4 focus-visible:ring-red-500/15 dark:border-red-500/70"
              : state === "available"
                ? "border-emerald-400 dark:border-emerald-500/70"
                : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600",
            className
          )}
          {...inputProps}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3" aria-hidden="true">
          {state === "checking" && <Loader2 className="h-4 w-4 animate-spin-smooth text-neutral-400" />}
          {state === "available" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {showError && <XCircle className="h-4 w-4 text-red-500" />}
        </div>
      </div>
      <p
        id={statusId}
        role={showError ? "alert" : "status"}
        aria-live="polite"
        className={cn(
          "min-h-[1rem] text-[13px] font-medium",
          showError ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {errorMessage ?? (state === "available" ? "Username is available" : " ")}
      </p>
    </div>
  );
});
