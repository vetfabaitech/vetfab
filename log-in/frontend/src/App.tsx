import { ToastProvider } from "@/hooks/useToast";
import { ToastViewport } from "@/components/Toast";
import { LoginPage } from "@/components/auth/LoginPage";
import { AuthCallbackPage } from "@/components/auth/AuthCallbackPage";
import { CompleteProfilePage } from "@/components/onboarding/CompleteProfilePage";

// No router installed -- these are the only extra URLs the app needs
// (GitHub/Google's OAuth redirect targets, see backend .env's
// GITHUB_REDIRECT_URI/GOOGLE_REDIRECT_URI, and the post-login onboarding
// step -- see AuthCallbackPage's window.location.assign("/onboarding")),
// so a plain path switch is simpler than pulling in react-router for
// three routes.
const path = window.location.pathname;

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
