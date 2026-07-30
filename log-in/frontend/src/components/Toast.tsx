import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useToast, type ToastItem, type ToastVariant } from "@/hooks/useToast";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof AlertTriangle; classes: string; iconClasses: string }> = {
  error: {
    icon: AlertTriangle,
    classes: "border-red-200 bg-white dark:border-red-500/25 dark:bg-neutral-900",
    iconClasses: "text-red-600 dark:text-red-400",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-white dark:border-emerald-500/25 dark:bg-neutral-900",
    iconClasses: "text-emerald-600 dark:text-emerald-400",
  },
  info: {
    icon: Info,
    classes: "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
    iconClasses: "text-neutral-500 dark:text-neutral-400",
  },
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const reduceMotion = useReducedMotion();
  const { icon: Icon, classes, iconClasses } = VARIANT_STYLES[toast.variant];

  return (
    <motion.div
      role="status"
      aria-live="polite"
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border p-4 shadow-card dark:shadow-card-dark", classes)}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClasses)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

/** Fixed bottom-right stack of dismissible toasts, mounted once near the
 * app root. aria-live="polite" (per-toast, above) means each is announced
 * as it appears without interrupting whatever the screen reader is
 * currently reading. */
export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
