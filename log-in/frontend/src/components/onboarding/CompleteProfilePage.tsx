import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Logo } from "@/components/icons/Logo";
import { ErrorAlert } from "@/components/auth/ErrorAlert";
import { getCurrentUser, type RealUser, type Profile } from "@/lib/realAuth";
import { ProfileForm } from "./ProfileForm";

const MAIN_APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3000";

function redirectToMainApp(): void {
  const token = window.sessionStorage.getItem("hdl_webide_access_token");
  window.location.assign(`${MAIN_APP_URL}/auth/handoff#token=${encodeURIComponent(token ?? "")}`);
}

/** One-time "create your IDE identity" step -- landed on from
 * AuthCallbackPage when GitHub sign-in succeeds but no `users` row exists
 * yet. Not reachable any other way: there's no session with nothing to
 * complete, and completing sends the browser straight to the main WebIDE
 * (see redirectToMainApp), so a direct visit here with an already-complete
 * session just loops back out via the `me` check below. */
export function CompleteProfilePage() {
  const [oauthUser, setOauthUser] = useState<RealUser | null | "loading">("loading");
  const [justCompleted, setJustCompleted] = useState<Profile | null>(null);

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (!user) {
        window.location.assign("/");
        return;
      }
      setOauthUser(user);
    });
  }, []);

  if (justCompleted) {
    return (
      <AuthCardShell>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col items-center py-6 text-center"
          role="status"
          aria-live="polite"
        >
          <Logo className="mb-4 h-11 w-11" />
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            Welcome, {justCompleted.username}
          </h2>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">Setting up your workspace…</p>
          <Loader2 className="mt-6 h-6 w-6 animate-spin-smooth text-brand-500" aria-hidden="true" />
        </motion.div>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell>
      {oauthUser === "loading" ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin-smooth text-brand-500" aria-hidden="true" />
        </div>
      ) : oauthUser === null ? (
        <ErrorAlert message="Your sign-in link has expired. Please sign in again." />
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <header className="mb-6 flex flex-col items-center text-center">
            <Logo className="mb-4 h-11 w-11" />
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              HDL WebIDE
            </p>
            <h1 className="text-[24px] font-bold leading-tight text-neutral-900 dark:text-neutral-50">
              Welcome to HDL WebIDE
            </h1>
            <p className="mt-2 max-w-[360px] text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Choose your developer identity. This username will be used across your projects and cannot be
              changed frequently.
            </p>
          </header>

          <div className="mb-6 flex items-center gap-3 rounded-control border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            {oauthUser.avatar_url ? (
              <img src={oauthUser.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {oauthUser.name ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{oauthUser.email}</p>
            </div>
          </div>

          <ProfileForm
            defaultDisplayName={oauthUser.name ?? ""}
            onSuccess={(profile) => {
              setJustCompleted(profile);
              window.setTimeout(redirectToMainApp, 1400);
            }}
          />
        </motion.div>
      )}
    </AuthCardShell>
  );
}
