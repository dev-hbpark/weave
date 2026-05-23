import { defineConfig } from "vitest/config";

// Keep vitest scoped to unit tests under src/. The e2e/ folder belongs to
// playwright (different runner, different lifecycle, different config).
export default defineConfig({
  test: {
    // Default to jsdom — storage / DOM-touching tests rely on window /
    // localStorage. Per-file `// @vitest-environment node` opts out.
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
