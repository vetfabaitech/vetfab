import { create } from "zustand";

interface ToastState {
  message: string | null;
  tone: "default" | "error";
  show: (message: string, tone?: "default" | "error") => void;
  clear: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** App-wide toast notifications (e.g. "Saved", "Project link copied
 * successfully.") -- a single message at a time is all the toolbar needs, so
 * this stays a flat store rather than a queue. Auto-dismisses after 2.4s;
 * calling `show` again resets that timer. */
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  tone: "default",
  show: (message, tone = "default") => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message, tone });
    hideTimer = setTimeout(() => set({ message: null }), 2400);
  },
  clear: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: null });
  },
}));
