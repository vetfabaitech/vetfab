"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AuthApiError, fetchUserProfile, signOut, type UserProfile } from "@/lib/auth";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { IconSettings, IconUser } from "./icons";

/** Single combined account control (GitHub-style: one avatar button opens a
 * dropdown with a profile summary, a link to the full Settings page, and
 * Sign out) -- replaces the header's previous separate gear (Preferences
 * modal) and person (account modal) buttons. */
export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setOpen(false));

  const handleToggle = () => {
    setOpen((v) => {
      const opening = !v;
      if (opening && !profile) {
        setLoading(true);
        setError(null);
        fetchUserProfile()
          .then(setProfile)
          .catch((err) => setError(err instanceof AuthApiError ? err.message : "Couldn't load your profile."))
          .finally(() => setLoading(false));
      }
      return opening;
    });
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        title="Account"
        className="flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
      >
        {profile?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <IconUser className="h-[18px] w-[18px]" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-panel-border bg-surface-1 py-1 shadow-elevated"
          >
            {loading && <p className="px-3 py-3 text-center text-xs text-text-muted">Loading…</p>}

            {!loading && error && <p className="px-3 py-3 text-center text-xs text-error">{error}</p>}

            {!loading && !error && profile && (
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-full bg-surface-hover" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{profile.displayName}</p>
                  <p className="truncate text-xs text-text-muted">{profile.email}</p>
                </div>
              </div>
            )}

            <div className="my-1 border-t border-panel-border" />

            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-text-primary transition-colors duration-200 hover:bg-surface-hover"
            >
              <IconSettings className="h-4 w-4 text-text-muted" />
              Settings
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-text-primary transition-colors duration-200 hover:bg-surface-hover"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
