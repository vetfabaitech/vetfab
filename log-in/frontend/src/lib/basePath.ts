/** Vite's own base URL for this build -- "/login/" in production (see
 * vite.config.ts's `base`), "/" in local dev. Anywhere this app navigates
 * to one of its *own* absolute paths (not a different origin) needs to go
 * through this instead of a hardcoded "/", or the link 404s once deployed
 * under the /login/ prefix behind Nginx. */
export const BASE_URL = import.meta.env.BASE_URL;

/** Prefixes an app-relative path ("/", "/onboarding") with BASE_URL,
 * producing "/login/onboarding" in production and "/onboarding" in dev. */
export function withBase(path: string): string {
  const trimmed = path.replace(/^\/+/, "");
  return trimmed ? `${BASE_URL}${trimmed}` : BASE_URL;
}
