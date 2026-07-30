"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useToastStore } from "@/store/toastStore";
import { IconCheck, IconWarning } from "@/components/Explorer/icons";

/** Single-slot toast notification (VS Code-style bottom-right pop), driven
 * by `useToastStore`. Mounted once near the app root. */
export default function Toast() {
  const message = useToastStore((s) => s.message);
  const tone = useToastStore((s) => s.tone);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex justify-end">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium shadow-elevated ${
              tone === "error" ? "border-error/30 bg-error/10 text-error" : "border-panel-border bg-surface-2 text-text-primary"
            }`}
          >
            {tone === "error" ? (
              <IconWarning className="h-4 w-4 shrink-0 text-error" />
            ) : (
              <IconCheck className="h-4 w-4 shrink-0 text-accent" />
            )}
            <span>{message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
