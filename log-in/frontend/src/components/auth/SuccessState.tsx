import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Shared by LoginPage (mock email/Google flows) and AuthCallbackPage (the
 * real GitHub flow) -- same "you're in, redirecting" moment regardless of
 * which path got you there. */
export function SuccessState({ redirectTarget }: { redirectTarget: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col items-center py-6 text-center"
      role="status"
      aria-live="polite"
    >
      <motion.div
        initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
      >
        <CheckCircle2 className="h-14 w-14 text-emerald-500" aria-hidden="true" />
      </motion.div>
      <h2 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-50">You&apos;re signed in</h2>
      <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">Redirecting you to {redirectTarget}…</p>
      <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <motion.div
          className="h-full rounded-full bg-brand-500"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: reduceMotion ? 0.01 : 1.4, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}
