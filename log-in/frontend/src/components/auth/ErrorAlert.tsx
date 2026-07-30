import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface ErrorAlertProps {
  message: string | null;
  onDismiss?: () => void;
}

/** Inline, dismissible alert for form-level errors (e.g. "Incorrect email
 * or password") -- sits above the fields it applies to. role="alert" means
 * assistive tech announces it the instant it mounts, without the user
 * needing to navigate to it first. */
export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="alert"
          initial={reduceMotion ? false : { opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-2.5 rounded-control border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-500/25 dark:bg-red-500/10">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="flex-1 text-sm font-medium text-red-800 dark:text-red-300">{message}</p>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss error"
                className="shrink-0 rounded-md p-0.5 text-red-500 transition-colors duration-150 hover:bg-red-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
