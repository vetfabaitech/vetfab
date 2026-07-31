import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Nginx serves this app's production build under the /login/ path prefix
// (see the reverse-proxy routing table in the repo root README/deployment
// notes), so every asset URL Vite emits into dist/index.html must be
// prefixed with /login/ too -- otherwise the browser requests
// /assets/index-*.js instead of /login/assets/index-*.js and gets a 404.
// Only applied for `vite build`: the dev server (`npm run dev`) keeps
// serving from / on its own port (5174), so local development is
// unaffected. `import.meta.env.BASE_URL` reflects whichever of these is
// active at runtime -- see src/App.tsx for where that matters for routing.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/login/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
  },
}));
