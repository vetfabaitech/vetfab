"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AUTH_TOKEN_KEY, sanitizeRedirectPath } from "@/lib/auth";

/** Receiving end of the log-in app's post-login redirect (see
 * ../../../../log-in/frontend/src/components/auth/AuthCallbackPage.tsx and
 * CompleteProfilePage.tsx's redirectToMainApp). The token travels as a URL
 * fragment (`#token=...&redirect=...`), not a query string, so it never
 * reaches this server or shows up in a Referer header -- only client JS
 * ever sees it, read here and moved into localStorage for AuthGuard to
 * find.
 *
 * Deliberately named /handoff, not /auth/handoff: Nginx routes the whole
 * /auth/ prefix to the separate FastAPI auth backend (see the deployment
 * routing table), so a page under /auth/ here would never actually be
 * reached behind the reverse proxy -- the request would go to that other
 * service instead. */
export default function AuthHandoffPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("token");
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    // sanitizeRedirectPath rejects anything that isn't a same-origin
    // relative path (absolute/protocol-relative URLs fall back to "/")
    // so a crafted `redirect` value can't send a freshly-signed-in user
    // off to another origin.
    router.replace(sanitizeRedirectPath(hash.get("redirect"), "/"));
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-app-bg">
      <p className="text-sm text-text-muted">Signing you in…</p>
    </div>
  );
}
