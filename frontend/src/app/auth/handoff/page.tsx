"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AUTH_TOKEN_KEY } from "@/lib/auth";

/** Receiving end of the log-in app's post-login redirect (see
 * ../../../../../log-in/frontend/src/components/auth/AuthCallbackPage.tsx
 * and CompleteProfilePage.tsx's redirectToMainApp). The token travels as a
 * URL fragment (`#token=...`), not a query string, so it never reaches
 * this server or shows up in a Referer header -- only client JS ever sees
 * it, read here and moved into localStorage for AuthGuard to find. */
export default function AuthHandoffPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("token");
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-app-bg">
      <p className="text-sm text-text-muted">Signing you in…</p>
    </div>
  );
}
