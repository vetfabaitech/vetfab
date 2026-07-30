/** Real auth calls -- unlike mockAuth.ts, this actually talks to the
 * backend in ../../backend (see its app/api/auth.py and app/api/user.py).
 * The GitHub and Google flows are wired up; everything else in this app
 * still goes through mockAuth.ts. Requires VITE_API_BASE_URL to point at a
 * running instance of that backend with GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET
 * and/or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET set (see
 * ../../backend/.env.example). */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TOKEN_KEY = "hdl_webide_access_token";

export class RealAuthError extends Error {}

export interface RealUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  provider: string;
}

export interface OAuthLoginResult {
  user: RealUser;
  accessToken: string;
  /** False the first time this account signs in -- no `users` row exists
   * yet, so AuthCallbackPage routes to /onboarding instead of handing off
   * to the main WebIDE. */
  profileComplete: boolean;
}

export interface Profile {
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

function getStoredToken(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      credentials: "include",
    });
  } catch {
    throw new RealAuthError("Network connection lost. Please try again.");
  }
  return response;
}

/** Reads the OAuth identity off the current session token (GET /me just
 * decodes JWT claims -- works even for a "pending" session with no
 * `users` row yet, which is exactly when CompleteProfilePage needs it to
 * show the avatar/name/email being onboarded). Null if not signed in. */
export async function getCurrentUser(): Promise<RealUser | null> {
  if (!getStoredToken()) return null;
  const response = await authedFetch("/api/v1/auth/me");
  if (!response.ok) return null;
  return response.json();
}

/** Navigates the whole browser (not a fetch) to the backend's authorize
 * endpoint, which itself redirects on to GitHub's consent screen. There's
 * no promise to await here -- the page is about to leave. */
export function startGithubLogin(): void {
  window.location.assign(`${API_BASE_URL}/api/v1/auth/github/authorize`);
}

/** Called from AuthCallbackPage once GitHub has redirected back with
 * `?code=&state=` in the URL. Exchanges them for a session via the
 * backend -- this is the one real network call in the whole app. */
export async function completeGithubLogin(code: string, state: string): Promise<OAuthLoginResult> {
  return completeOAuthLogin("github", code, state);
}

/** Navigates the whole browser to the backend's Google authorize redirect
 * -- same shape as startGithubLogin above. */
export function startGoogleLogin(): void {
  window.location.assign(`${API_BASE_URL}/api/v1/auth/google/authorize`);
}

/** Called from AuthCallbackPage once Google has redirected back with
 * `?code=&state=` in the URL -- same shape as completeGithubLogin above. */
export async function completeGoogleLogin(code: string, state: string): Promise<OAuthLoginResult> {
  return completeOAuthLogin("google", code, state);
}

async function completeOAuthLogin(provider: "github" | "google", code: string, state: string): Promise<OAuthLoginResult> {
  const providerLabel = provider === "github" ? "GitHub" : "Google";
  const response = await authedFetch(`/api/v1/auth/${provider}/callback`, {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });

  if (!response.ok) {
    // app/api/auth.py's {provider}_callback returns a distinct `detail` for
    // each failure mode (expired state, provider round-trip failed, user
    // store unreachable, ...) -- surface that instead of a blanket message,
    // since not every failure here is actually the provider's fault. Fall
    // back to the generic copy only if the response has no body to read
    // (proxy error, backend down entirely, etc).
    const body = await response.json().catch(() => null);
    throw new RealAuthError(body?.detail ?? `Unable to authenticate with ${providerLabel}. Please try again.`);
  }

  const body = (await response.json()) as {
    user: RealUser;
    access_token: string;
    profile_complete: boolean;
  };
  // Demo-scoped session storage -- see this file's doc comment. A real
  // deployment would rely on the httpOnly cookie {provider}_callback also
  // sets instead of holding the token in sessionStorage.
  window.sessionStorage.setItem(TOKEN_KEY, body.access_token);
  return { user: body.user, accessToken: body.access_token, profileComplete: body.profile_complete };
}

/** Debounced by the caller (see UsernameField.tsx) -- this is just the
 * network call. */
export async function checkUsername(username: string): Promise<{ available: boolean; reason?: string }> {
  const response = await authedFetch(`/api/v1/user/check-username?username=${encodeURIComponent(username)}`);
  if (!response.ok) {
    throw new RealAuthError("Unable to check username availability right now.");
  }
  return response.json();
}

export interface CompleteProfileInput {
  username: string;
  displayName: string;
  bio: string;
  country: string;
  timezone: string;
  preferredHdl: string;
  theme: string;
  defaultVisibility: string;
}

export async function completeProfile(input: CompleteProfileInput): Promise<Profile> {
  const response = await authedFetch("/api/v1/user/complete-profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new RealAuthError(body?.detail ?? "Unable to save your profile. Please try again.");
  }
  return response.json();
}

export async function getProfile(): Promise<Profile | null> {
  const response = await authedFetch("/api/v1/user/profile");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new RealAuthError("Unable to load your profile right now.");
  }
  return response.json();
}
