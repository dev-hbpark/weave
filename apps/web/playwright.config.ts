import { defineConfig, devices } from "@playwright/test";

// WI-009 PoC verification — the dev server should already be running on :5174
// (the project's `pnpm dev`). If it isn't, playwright will start one.

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // WI-033 — single retry on flaky specs. WI-032 Phase 3c's hygiene
  // pass (cursor reset + networkidle + .vite cache cold start) covers
  // the common cluster, but the group run still sees occasional
  // single-spec races (e.g. A3 Tab wrap-around in figma-keyboard-
  // selection-nav passes alone, fails ~1/N in groups). retries: 1
  // absorbs those without papering over real regressions — a stable
  // failure still bubbles up after the second attempt.
  retries: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:5179",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Port 5179 (not 5174) so this never collides with a developer's
    // own dev server on the default port — keeps `pnpm dev` for
    // editing and `pnpm e2e` for verification cleanly separated.
    command: "pnpm dev --port 5179",
    url: "http://localhost:5179",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
