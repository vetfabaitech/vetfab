import { ToastProvider } from "@/hooks/useToast";
import { ToastViewport } from "@/components/Toast";
import { LoginPage } from "@/components/auth/LoginPage";
import { AuthCallbackPage } from "@/components/auth/AuthCallbackPage";
import { CompleteProfilePage } from "@/components/onboarding/CompleteProfilePage";
import { BASE_URL } from "@/lib/basePath";

// No router installed -- these are the only extra URLs the app needs
// (GitHub/Google's OAuth redirect targets, see backend .env's
// GITHUB_REDIRECT_URI/GOOGLE_REDIRECT_URI, and the post-login onboarding
// step -- see AuthCallbackPage's window.location.assign("/onboarding")),
// so a plain path switch is simpler than pulling in react-router for
// three routes.
//
// In production this app is served under the /login/ prefix (see
// vite.config.ts's `base`), so window.location.pathname is really
// "/login/auth/callback/github", not "/auth/callback/github" -- strip
// Vite's own BASE_URL (which tracks that same prefix, "/" in dev) before
// matching so routing works in both places without hardcoding "/login".
const rawPath = window.location.pathname;
const path = "/" + (rawPath.startsWith(BASE_URL) ? rawPath.slice(BASE_URL.length) : rawPath.replace(/^\/+/, ""));

export default function App() {
  return (
    <ToastProvider>
      {path === "/auth/callback/github" ? (
        <AuthCallbackPage provider="github" />
      ) : path === "/auth/callback/google" ? (
        <AuthCallbackPage provider="google" />
      ) : path === "/onboarding" ? (
        <CompleteProfilePage />
      ) : (
        <LoginPage />
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
