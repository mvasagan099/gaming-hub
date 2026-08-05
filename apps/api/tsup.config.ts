import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  sourcemap: true,
  clean: true,
  noExternal: [/@gaming-hub\/(shared|game-engine|socket)/],
  external: [
    "@prisma/client",
    "@prisma/client/runtime/*",
    "pino-pretty",
  ],
});
