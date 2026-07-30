import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        // Brand accent -- matches the main HDL WebIDE app's --color-accent
        // (frontend/src/app/globals.css) so this page reads as the same
        // product, not a bolted-on third-party auth screen.
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        canvas: {
          light: "#ffffff",
          dark: "#0a0a0a",
        },
        surface: {
          light: "#ffffff",
          dark: "#141414",
        },
      },
      borderRadius: {
        card: "16px",
        control: "10px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.10)",
        "card-dark": "0 1px 2px 0 rgb(0 0 0 / 0.3), 0 8px 32px -8px rgb(0 0 0 / 0.5)",
        "focus-glow": "0 0 0 4px rgb(59 130 246 / 0.15)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-smooth": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "spin-smooth": "spin-smooth 0.7s linear infinite",
      },
      transitionDuration: {
        150: "150ms",
        250: "250ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
