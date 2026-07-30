import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validation";
import { signInWithEmail, AuthError, type AuthSession } from "@/lib/mockAuth";
import { PasswordInput } from "./PasswordInput";
import { FormField } from "./FormField";
import { ErrorAlert } from "./ErrorAlert";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  onSuccess: (session: AuthSession) => void;
  /** True while an OAuth attempt is in flight -- fields and submit disable
   * too, so only one auth attempt is ever in progress at a time. */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onForgotPassword: () => void;
}

export function LoginForm({ onSuccess, disabled, onBusyChange, onForgotPassword }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "", remember: false },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    onBusyChange?.(true);
    try {
      const session = await signInWithEmail(values);
      onSuccess(session);
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Please try again.");
    } finally {
      onBusyChange?.(false);
    }
  };

  const busy = isSubmitting || disabled;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <ErrorAlert message={formError} onDismiss={() => setFormError(null)} />

      <div className="flex flex-col gap-4">
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          disabled={busy}
          error={errors.email?.message}
          {...register("email")}
        />

        <div>
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={busy}
            error={errors.password?.message}
            {...register("password")}
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="flex select-none items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              disabled={busy}
              className={cn(
                "h-4 w-4 rounded border-neutral-300 text-brand-600 transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                "dark:border-neutral-600 dark:bg-neutral-800 dark:ring-offset-neutral-950"
              )}
              {...register("remember")}
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm font-medium text-brand-600 transition-colors duration-150 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-brand-400 dark:hover:text-brand-300 dark:focus-visible:ring-offset-neutral-950"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          aria-busy={isSubmitting}
          className={cn(
            "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-control bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150",
            "hover:bg-brand-700 hover:shadow-md active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
            "disabled:pointer-events-none disabled:opacity-60"
          )}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin-smooth" aria-hidden="true" />}
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
