import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/icons/Logo";
import { AuthCardShell } from "./AuthCardShell";
import { SuccessState } from "./SuccessState";
import { ErrorAlert } from "./ErrorAlert";
import { completeGithubLogin, completeGoogleLogin, RealAuthError } from "@/lib/realAuth";

type Status = "exchanging" | "success" | "error";
type Provider = "github" | "google";

const MAIN_APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3000";

const PROVIDER_LABEL: Record<Provider, string> = { github: "GitHub", google: "Google" };
const PROVIDER_COMPLETE: Record<Provider, typeof completeGithubLogin> = {
  github: completeGithubLogin,
  google: completeGoogleLogin,
};

interface AuthCallbackPageProps {
  provider: Provider;
}

/** Hands the session token to the main WebIDE (a different origin/port --
 * see ../../../frontend/src/app/auth/handoff/page.tsx for the receiving
 * end) via a URL fragment rather than a query string, so it never reaches
 * server logs or a Referer header. */
function redirectToMainApp(accessToken: string): void {
  window.location.assign(`${MAIN_APP_URL}/auth/handoff#token=${encodeURIComponent(accessToken)}`);
}

/** Landing point for a provider's redirect back after the user approves (or
 * denies) the consent screen -- this URL is what GITHUB_REDIRECT_URI /
 * GOOGLE_REDIRECT_URI in the backend's .env point at. See App.tsx for how
 * this gets routed to (per-provider path) without a real router installed. */
export function AuthCallbackPage({ provider }: AuthCallbackPageProps) {
  const providerLabel = PROVIDER_LABEL[provider];
  const [status, setStatus] = useState<Status>("exchanging");
  const [errorMessage, setErrorMessage] = useState(`Unable to authenticate with ${providerLabel}. Please try again.`);
  // StrictMode double-invokes effects in dev -- without this guard, the
  // authorization `code` (single-use) would get sent twice, and the
  // second exchange would always fail.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const deniedReason = params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (deniedReason) {
      setErrorMessage(
        deniedReason === "access_denied"
          ? "Sign-in was cancelled."
          : `Unable to authenticate with ${providerLabel}. Please try again.`
      );
      setStatus("error");
      return;
    }

    if (!code || !state) {
      setErrorMessage("This sign-in link is invalid. Please start again.");
      setStatus("error");
      return;
    }

    PROVIDER_COMPLETE[provider](code, state)
      .then((result) => {
        if (!result.profileComplete) {
          // First time this account has signed in -- no `users` row yet.
          // Same-origin nav, so the session token already written to
          // sessionStorage by the complete*Login call survives the hop.
          window.location.assign("/onboarding");
          return;
        }
        setStatus("success");
        // Let the "you're signed in" moment register before the browser
        // leaves for a different origin -- matches SuccessState's own
        // ~1.4s progress-bar animation.
        window.setTimeout(() => redirectToMainApp(result.accessToken), 1200);
      })
      .catch((err) => {
        setErrorMessage(err instanceof RealAuthError ? err.message : "Something went wrong. Please try again.");
        setStatus("error");
      });
  }, [provider, providerLabel]);

  return (
    <AuthCardShell>
      {status === "exchanging" && (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin-smooth text-brand-500" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">Finishing sign-in with {providerLabel}…</p>
        </div>
      )}

      {status === "success" && <SuccessState redirectTarget="your WebIDE workspace" />}

      {status === "error" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-2 text-center">
          <Logo className="mb-4 h-11 w-11" />
          <div className="w-full text-left">
            <ErrorAlert message={errorMessage} />
          </div>
          <a
            href="/"
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-control bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
          >
            Back to sign in
          </a>
        </motion.div>
      )}
    </AuthCardShell>
  );
}
