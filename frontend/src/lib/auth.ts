/** Shared by AuthGuard and the /handoff receiving page -- the token
 * the log-in app (see ../../../log-in/frontend) hands off after a
 * successful sign-in. Session-only concern for now: nothing in this app
 * verifies the token against the backend yet, it's just a "did the user
 * come from a completed login" marker (see AuthGuard's doc comment for
 * that scope boundary). */
export const AUTH_TOKEN_KEY = "hdl_webide_token";

/** Only allows same-origin relative paths through as a post-login redirect
 * target -- rejects absolute URLs ("https://evil.com/x") and
 * protocol-relative ones ("//evil.com/x", "/\\evil.com/x") so a crafted
 * `redirect` value can't send a signed-in user off to a different origin
 * (open redirect / phishing). Both AuthGuard (building the value) and
 * /handoff (consuming it) go through this. */
export function sanitizeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  return /^\/(?!\/|\\)/.test(value) ? value : fallback;
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Reads a JWT's payload without verifying its signature -- this app has no
 * way to verify it anyway (that's the backends' job, see
 * ../../../backend/app/api/deps.py); everything built on this is a UX
 * convenience, never a security decision. Returns null for anything that
 * isn't a well-formed JWT. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** True once the token's own `exp` claim has passed (or it's not decodable
 * at all -- a corrupt/foreign localStorage value is treated the same as
 * "expired"). Lets AuthGuard bounce back to sign-in immediately instead of
 * only failing the next time some API call happens to need auth. */
export function isTokenExpired(token: string): boolean {
  const claims = decodeJwtPayload(token);
  const exp = claims?.exp;
  if (typeof exp !== "number") return true;
  return Date.now() >= exp * 1000;
}

/** The `sub` claim -- whichever `users.id` this session belongs to, or null
 * if undecodable. Used to notice an account switch (see useStoresHydrated)
 * so one account's cached workspace never gets rendered under another. */
export function getTokenSubject(token: string): string | null {
  const sub = decodeJwtPayload(token)?.sub;
  return typeof sub === "string" ? sub : null;
}

// "/login" and "/auth" below are same-origin, reachable through Nginx's
// /login/ and /auth/ prefixes (see the deployment routing table) -- safe
// production defaults that need no configuration, unlike a hardcoded
// host:port. Local dev overrides both via .env.local (each app runs on
// its own port there with no reverse proxy in front).
export function getLoginAppUrl(): string {
  return process.env.NEXT_PUBLIC_LOGIN_APP_URL || "/login";
}

/** getLoginAppUrl() without a trailing slash, however it's configured --
 * callers append their own single "/" so an accidentally-trailing-slash
 * env value (e.g. "/login/") can't produce a "//" in the final URL. */
function loginAppRoot(): string {
  return getLoginAppUrl().replace(/\/+$/, "");
}

/** The auth backend (see ../../../log-in/backend), not this app's own
 * :8000 backend -- profile/username data lives there (app/api/user.py). */
export function getAuthApiUrl(): string {
  return process.env.NEXT_PUBLIC_AUTH_API_URL || "/auth";
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  timezone: string | null;
  preferredHdl: string;
  theme: string;
  defaultVisibility: string;
}

export class AuthApiError extends Error {}

/** GET /api/v1/user/profile -- the completed-onboarding profile for
 * whoever the stored token belongs to. Throws AuthApiError if there's no
 * token, the token's expired, or the backend is unreachable; ProfileMenu
 * is the one caller today and treats any of those as "show a fallback"
 * rather than force-signing-out (matches AuthGuard's scope boundary: this
 * app doesn't otherwise validate the token). */
export async function fetchUserProfile(): Promise<UserProfile> {
  const token = getStoredAuthToken();
  if (!token) throw new AuthApiError("Not signed in.");

  let response: Response;
  try {
    response = await fetch(`${getAuthApiUrl()}/api/v1/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AuthApiError("Couldn't reach the account service.");
  }
  if (!response.ok) {
    throw new AuthApiError(response.status === 401 ? "Your session has expired." : "Couldn't load your profile.");
  }
  return response.json();
}

/** Clears the local session and sends the browser back to the log-in app.
 * Doesn't call a backend /logout -- the token is a bearer token this app
 * only ever holds in localStorage (see AUTH_TOKEN_KEY's doc), so "signed
 * out" here just means "this browser no longer has it". */
export function signOut(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.assign(`${loginAppRoot()}/`);
}
