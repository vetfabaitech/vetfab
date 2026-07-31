import { useMemo } from "react";

/** Default post-login destination (a path inside the main WebIDE app, not
 * this login app) when no `?redirect=` was supplied. The IDE is served at
 * the main app's root ("/"), not "/workspace" -- there is no /workspace
 * route, so that value 404'd on every login that didn't arrive with an
 * explicit `?redirect=` (i.e. GitHub/Google sign-in from the login app's
 * own landing page, not bounced here by AuthGuard). */
const DEFAULT_REDIRECT_TARGET = "/";

/** sessionStorage key the redirect target is stashed under while the
 * browser round-trips to a GitHub/Google consent screen and back -- see
 * OAuthButtons (stashes it before navigating away) and AuthCallbackPage /
 * CompleteProfilePage (read + clear it once sign-in completes). A plain
 * `?redirect=` query param wouldn't survive that round trip since the
 * provider controls what it appends to its own callback URL. */
export const REDIRECT_STORAGE_KEY = "hdl_webide_pending_redirect";

/** Only allows same-origin relative paths through as a redirect target --
 * rejects absolute URLs ("https://evil.com/x") and protocol-relative ones
 * ("//evil.com/x", "/\\evil.com/x") so a crafted `?redirect=` link can't
 * send a signed-in user off to a different origin (open redirect /
 * phishing). Every consumer of a redirect value that ultimately reached
 * `window.location.assign` -- here, and the main app's `/handoff` page --
 * must run it through this first. */
export function sanitizeRedirectTarget(value: string | null | undefined): string {
  if (!value) return DEFAULT_REDIRECT_TARGET;
  return /^\/(?!\/|\\)/.test(value) ? value : DEFAULT_REDIRECT_TARGET;
}

/** Where a successful sign-in should send someone -- read once from
 * `?redirect=`, same as a real router guard would pass it through. Falls
 * back to the app's default landing route. Shared by LoginPage (mock
 * flows) and AuthCallbackPage (the real GitHub flow) so both show the
 * same destination. */
export function useRedirectTarget(): string {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return sanitizeRedirectTarget(params.get("redirect"));
  }, []);
}
