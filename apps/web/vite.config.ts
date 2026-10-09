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
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://127.0.0.1:4000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: process.env.VITE_DEV_SOCKET_TARGET || "http://127.0.0.1:4001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Do NOT publish source maps in the production bundle.
    // Source maps would expose original TypeScript source and variable names
    // to anyone who extracts the APK or visits the web build.
    sourcemap: false,

    rolldownOptions: {
      output: {
        minify: {
          compress: { dropDebugger: true },
          codegen: { legalComments: 'none' },
        },
      },
    },
  },
});
