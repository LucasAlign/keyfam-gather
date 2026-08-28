import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"], exclude: ["tests/e2e/**", "node_modules/**"] },
});
