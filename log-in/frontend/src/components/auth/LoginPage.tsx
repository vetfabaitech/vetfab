import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "@/components/icons/Logo";
import { AuthCardShell } from "./AuthCardShell";
import { OAuthButtons } from "./OAuthButtons";
import { Divider } from "./Divider";
import { LoginForm } from "./LoginForm";
import { Footer } from "./Footer";
import { SuccessState } from "./SuccessState";
import { useToast } from "@/hooks/useToast";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRedirectTarget } from "@/lib/useRedirectTarget";
import type { AuthSession } from "@/lib/mockAuth";

export function LoginPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const redirectTarget = useRedirectTarget();

  const handleSuccess = (result: AuthSession) => {
    // Real wiring: persist the session (cookie/token from the backend
    // response), then `window.location.assign(redirectTarget)` -- left as
    // a visible "redirecting" state here since there's nowhere real to
    // send the browser in a standalone UI preview.
    setSession(result);
  };

  const handleForgotPassword = () =>
    showToast({ variant: "info", title: "Preview only", description: "Password reset isn't wired up in this UI preview yet." });

  return (
    <AuthCardShell>
      <AnimatePresence mode="wait">
        {session ? (
          <SuccessState key="success" redirectTarget={redirectTarget} />
        ) : (
          <motion.div
            key="form"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <header className="mb-7 flex flex-col items-center text-center">
              <Logo className="mb-4 h-11 w-11" />
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                HDL WebIDE
              </p>
              <h1 className="text-[26px] font-bold leading-tight text-neutral-900 dark:text-neutral-50">Welcome back</h1>
              <p className="mt-2 max-w-[340px] text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                Sign in to continue building and simulating hardware designs.
              </p>
            </header>

            <OAuthButtons onSuccess={handleSuccess} disabled={formBusy} onBusyChange={setOauthBusy} />

            <div className="my-6">
              <Divider />
            </div>

            <LoginForm onSuccess={handleSuccess} onBusyChange={setFormBusy} disabled={oauthBusy} onForgotPassword={handleForgotPassword} />

            <div className="mt-7">
              <Footer />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthCardShell>
  );
}
