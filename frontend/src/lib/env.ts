/** Backend base URLs, shared by every fetch/WebSocket call site instead of
 * each repeating its own `process.env.NEXT_PUBLIC_API_URL ?? "..."` guess.
 *
 * The fallback (when the env var isn't set) is same-origin/relative, not a
 * hardcoded localhost:8000 -- Nginx routes /api/ on this app's own origin
 * to the FastAPI backend (see the deployment routing table), so a relative
 * path already resolves correctly behind the reverse proxy with zero
 * configuration. A hardcoded "http://localhost:8000" fallback, by
 * contrast, only works when nothing set the env var *and* the browser
 * happens to be on the same machine as the backend -- never true in
 * production, where it sends every request to the visitor's own laptop.
 *
 * Local dev still explicitly sets NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WS_URL in
 * .env.local (the Next dev server on :3000 has no reverse proxy in front of
 * it, so a relative URL there would hit :3000 itself, not the :8000
 * backend) -- these fallbacks only matter when that var is absent, i.e. in
 * a production build that forgot to set it, where "safe default" beats
 * "silently broken". */

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}

/** WebSocket URLs can't be relative (the `WebSocket` constructor requires a
 * full ws(s)://host URL), so the same-origin fallback is built from
 * `window.location` instead of an empty string -- call this from an event
 * handler/effect (never at module scope), so it always runs client-side. */
export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
