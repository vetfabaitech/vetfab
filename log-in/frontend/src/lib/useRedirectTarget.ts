import { useMemo } from "react";

/** Where a successful sign-in should send someone -- read once from
 * `?redirect=`, same as a real router guard would pass it through. Falls
 * back to the app's default landing route. Shared by LoginPage (mock
 * flows) and AuthCallbackPage (the real GitHub flow) so both show the
 * same destination. */
export function useRedirectTarget(): string {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("redirect") || "/workspace";
  }, []);
}
