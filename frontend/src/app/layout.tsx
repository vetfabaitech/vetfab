import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AuthGuard from "@/components/AuthGuard";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "HDL WebIDE",
  description: "Browser-based IDE for Verilog, SystemVerilog, and VHDL",
};

// Swallows exactly one benign unhandled rejection: the Monaco editor loader's
// cancellation signal `{type:"cancelation", msg:"operation is manually
// canceled"}` (from @monaco-editor/loader's makeCancelable), which rejects
// whenever the editor unmounts before Monaco finishes loading -- React
// StrictMode's dev double-mount reliably triggers it. `@monaco-editor/react`
// already ignores this exact `type` on its own init promise; this applies the
// same policy to the copy that leaks. Must run as an inline head script (not a
// React effect) so it registers BEFORE Next.js's dev overlay handler -- only
// then can stopImmediatePropagation keep the overlay from surfacing it as
// `[object Object]`. Narrow by design: only `type === "cancelation"` is
// swallowed; every real rejection propagates untouched.
const SILENCE_MONACO_CANCELATION = `
window.addEventListener('unhandledrejection', function (e) {
  var r = e && e.reason;
  if (r && r.type === 'cancelation') { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
`;

// Applies the persisted (or OS-preferred) theme to <html> before the first
// paint -- must run as a blocking inline script, not a React effect, or
// there's a flash of the wrong theme while React hydrates (worse still,
// while settingsStore's own `skipHydration` rehydration is in flight -- see
// useStoresHydrated). Reads zustand persist's own storage format directly
// (`{state: {...}}` under settingsStore.SETTINGS_STORAGE_KEY) rather than a
// separate key, so there's exactly one source of truth for the choice.
const APPLY_INITIAL_THEME = `
(function () {
  try {
    var theme = null;
    var raw = window.localStorage.getItem('vetfab-settings-v1');
    if (raw) {
      var parsed = JSON.parse(raw);
      var stored = parsed && parsed.state && parsed.state.appTheme;
      if (stored === 'light' || stored === 'dark') theme = stored;
    }
    if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_INITIAL_THEME }} />
        <script dangerouslySetInnerHTML={{ __html: SILENCE_MONACO_CANCELATION }} />
      </head>
      <body className="h-full antialiased">
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
