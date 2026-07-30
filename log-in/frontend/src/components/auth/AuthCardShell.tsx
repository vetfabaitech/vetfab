import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** The centered card + ambient background + theme toggle every auth screen
 * shares -- LoginPage and AuthCallbackPage both render inside this so a
 * GitHub-flow redirect back to the app doesn't visually jar against the
 * page you started on. */
export function AuthCardShell({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas-light px-4 py-10 dark:bg-canvas-dark sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/[0.07]" />
      </div>

      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative w-full max-w-[460px] sm:w-[90%] md:w-full"
      >
        <div className="rounded-card border border-neutral-200 bg-white/90 p-6 shadow-card backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80 dark:shadow-card-dark sm:p-9">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
