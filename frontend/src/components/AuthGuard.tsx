"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AUTH_TOKEN_KEY, getLoginAppUrl, getStoredAuthToken, isTokenExpired } from "@/lib/auth";

// /handoff is what *establishes* the token (see its page.tsx) -- gating it
// too would bounce the browser back to the log-in app before it ever gets
// to read the token out of the URL fragment. (Deliberately not
// /auth/handoff: Nginx routes the whole /auth/ prefix to the separate
// auth backend, so a Next.js page living under /auth/ would never be
// reachable behind the reverse proxy -- see the deployment routing table.)
const UNGUARDED_PATHS = new Set(["/handoff"]);

type Status = "checking" | "authed" | "redirecting";

/** Builds the URL that sends an unauthenticated visitor to the log-in app,
 * carrying along the page they were trying to reach so it can send them
 * back after signing in (see /handoff's `redirect` handling).
 *
 * Uses the current path/query/hash, not the full `window.location.href` --
 * this is same-origin by construction (no host to get wrong) and, crucially,
 * strips any `redirect` param already on the current URL first. Without
 * that, a misconfigured NEXT_PUBLIC_LOGIN_APP_URL that loops back to this
 * same app (or any other bounce back to an already-redirected URL) grows a
 * `?redirect=...?redirect=...?redirect=...` chain on every hop until the
 * URL blows past the server's request-line limit (414) -- this is exactly
 * that failure mode, fixed by construction rather than relying on
 * NEXT_PUBLIC_LOGIN_APP_URL always being configured correctly. */
function buildLoginRedirectUrl(): string {
  const loginAppUrl = getLoginAppUrl().replace(/\/+$/, "");
  const current = new URL(window.location.href);
  current.searchParams.delete("redirect");
  const target = `${current.pathname}${current.search}${current.hash}`;
  return `${loginAppUrl}/?redirect=${encodeURIComponent(target)}`;
}

/** Client-side gate: no stored session token -> bounce to the log-in app
 * instead of rendering the IDE.
 *
 * Deliberately a plain useState+useEffect mount check rather than
 * useSyncExternalStore -- localStorage-backed auth gates like this are a
 * well-trodden pattern and easy to reason about; the SSR-hydration
 * reconciliation useSyncExternalStore buys isn't worth the extra
 * complexity for something this load-bearing (get this wrong and every
 * page load bounces a signed-in user back out).
 *
 * Scope boundary (deliberate, not an oversight): this stops the page from
 * *loading* without a token, and also bounces out once that token's own
 * `exp` claim has passed (see lib/auth.ts's isTokenExpired -- read client-
 * side, not signature-verified, since verification isn't this app's job).
 * It does not otherwise verify the token against this app's backend
 * (:8000) -- most routes there are exactly as open as before this existed;
 * only /api/v1/project/* actually checks the token server-side (see
 * backend/app/api/deps.py). Real per-request authorization everywhere else
 * is a separate, larger follow-up. */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unguarded = UNGUARDED_PATHS.has(pathname);
  const [status, setStatus] = useState<Status>(unguarded ? "authed" : "checking");

  useEffect(() => {
    if (unguarded) return;
    const token = getStoredAuthToken();
    if (token && !isTokenExpired(token)) {
      // localStorage only exists client-side -- this one-time post-mount
      // check is the standard way to read it without an SSR/hydration
      // mismatch, and the deliberate reason this isn't useSyncExternalStore
      // (see this component's doc comment).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("authed");
      return;
    }
    if (token) {
      // Expired, not just missing -- drop it so a stale token doesn't
      // linger in localStorage past the point it's actually useful.
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    setStatus("redirecting");
    window.location.assign(buildLoginRedirectUrl());
  }, [unguarded]);

  if (status !== "authed") {
    return (
      <div className="flex h-screen items-center justify-center bg-app-bg">
        <p className="text-sm text-text-muted">{status === "redirecting" ? "Redirecting to sign in…" : "Loading…"}</p>
      </div>
    );
  }

  return <>{children}</>;
}
