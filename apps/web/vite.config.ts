import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@gaming-hub/shared": path.resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
      "@gaming-hub/game-engine": path.resolve(import.meta.dirname, "../../packages/game-engine/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
