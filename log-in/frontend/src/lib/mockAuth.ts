/** Simulated auth layer -- UI preview only, nothing here calls a real
 * backend yet. Every function has the exact shape a real implementation
 * would have (same params, same return/throw contract) so wiring it up
 * later is a matter of replacing the body, not touching any component.
 *
 * Real wiring would POST to `${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/...`
 * (see ../../backend/app/api/auth.py for the stub endpoints already shaped
 * to match) and redirect through each provider's OAuth consent screen using
 * VITE_GOOGLE_CLIENT_ID / VITE_GITHUB_CLIENT_ID.
 *
 * QA hook: to see the error/toast states without a backend, submit the
 * email/password form with email "error@example.com" (any password), or
 * pass provider = the one you want to fail into `simulateOAuth`'s `force`
 * param via the buttons' long-press... actually simplest: OAuthButtons
 * fails Google by default 1 in 6 tries and GitHub never, both overridable --
 * see OAuthButtons.tsx. Every other input succeeds after a realistic delay.
 */

import type { LoginFormValues } from "./validation";

export class AuthError extends Error {}

const NETWORK_DELAY_MS = 1100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AuthSession {
  email: string;
  provider: "password" | "google" | "github";
}

/** Simulates POST /api/v1/auth/login. Never actually reaches a network --
 * see the class doc for how to exercise the error path deliberately. */
export async function signInWithEmail(values: LoginFormValues): Promise<AuthSession> {
  await delay(NETWORK_DELAY_MS);

  if (values.email.toLowerCase() === "error@example.com") {
    throw new AuthError("Incorrect email or password.");
  }
  if (values.email.toLowerCase() === "offline@example.com") {
    throw new AuthError("Network connection lost. Please try again.");
  }

  return { email: values.email, provider: "password" };
}

/** Simulates the redirect-based OAuth flow's eventual outcome (what a real
 * implementation would resolve once the provider's popup/redirect completes
 * and the backend exchanges the code). `shouldFail` lets the caller (see
 * OAuthButtons' demo toggle) force the error path for visual QA. */
export async function signInWithProvider(
  provider: "google" | "github",
  opts: { shouldFail?: boolean } = {}
): Promise<AuthSession> {
  await delay(NETWORK_DELAY_MS + 300);

  if (opts.shouldFail) {
    const label = provider === "google" ? "Google" : "GitHub";
    throw new AuthError(`Unable to authenticate with ${label}. Please try again.`);
  }

  return { email: `demo@${provider}.example`, provider };
}
