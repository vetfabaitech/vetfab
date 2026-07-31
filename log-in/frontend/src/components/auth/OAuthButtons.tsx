import { useState } from "react";
import { Loader2 } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import type { AuthSession } from "@/lib/mockAuth";
import { startGithubLogin, startGoogleLogin } from "@/lib/realAuth";
import { cn } from "@/lib/utils";
import { REDIRECT_STORAGE_KEY, useRedirectTarget } from "@/lib/useRedirectTarget";

type Provider = "google" | "github";

interface OAuthButtonsProps {
  // Both providers now navigate away immediately (see handleClick), so
  // this never actually fires -- kept so callers don't need to change,
  // and so a future password-reset-style in-page provider could reuse it.
  onSuccess: (session: AuthSession) => void;
  /** True while the email/password form is submitting -- both OAuth
   * buttons disable too, so only one auth attempt is ever in flight. */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

const PROVIDER_CONFIG: Record<Provider, { label: string; Icon: typeof GoogleIcon; start: () => void }> = {
  google: { label: "Continue with Google", Icon: GoogleIcon, start: startGoogleLogin },
  github: { label: "Continue with GitHub", Icon: GitHubIcon, start: startGithubLogin },
};

export function OAuthButtons({ disabled, onBusyChange }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const redirectTarget = useRedirectTarget();

  const handleClick = (provider: Provider) => {
    setLoadingProvider(provider);
    onBusyChange?.(true);
    // The `?redirect=` query param this page was loaded with doesn't
    // survive the round trip to the provider's consent screen and back --
    // the provider controls what it appends to its own callback URL. Stash
    // it in sessionStorage (same origin, survives full navigations) so
    // AuthCallbackPage can read it back once the OAuth exchange completes
    // and hand it off to the main app instead of always landing on the
    // default workspace route.
    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectTarget);
    // Navigates the browser to the backend's authorize redirect and never
    // returns -- no session to resolve here, no cleanup, since the page
    // is about to unload.
    PROVIDER_CONFIG[provider].start();
  };

  const isBusy = loadingProvider !== null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {(Object.keys(PROVIDER_CONFIG) as Provider[]).map((provider) => {
        const { label, Icon } = PROVIDER_CONFIG[provider];
        const isThisLoading = loadingProvider === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => handleClick(provider)}
            disabled={disabled || isBusy}
            aria-label={isThisLoading ? `${label} — signing in` : label}
            aria-busy={isThisLoading}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center gap-2.5 rounded-control border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition-all duration-150",
              "hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-md active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950",
              "disabled:pointer-events-none disabled:opacity-60",
              "dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            )}
          >
            {isThisLoading ? (
              <Loader2 className="h-4 w-4 animate-spin-smooth text-neutral-400" aria-hidden="true" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            <span>{isThisLoading ? "Signing in…" : label}</span>
          </button>
        );
      })}
    </div>
  );
}
