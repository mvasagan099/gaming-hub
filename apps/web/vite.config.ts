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
  envDir: "../../",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Do NOT publish source maps in the production bundle.
    // Source maps would expose original TypeScript source and variable names
    // to anyone who extracts the APK or visits the web build.
    sourcemap: false,

    // esbuild transform options applied during production minification.
    // drop: ['debugger'] removes any stray `debugger;` statements that
    // could enable DevTools pause-on-debugger in production.
    // legalComments: 'none' strips license banner comments from the output,
    // which can reveal library names, versions and internal details.
  },
  esbuild: {
    // Strip debugger statements and legal comments from all production output.
    drop: ["debugger"],
    legalComments: "none",
  },
});
