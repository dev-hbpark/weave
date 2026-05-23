import { defineConfig, devices } from "@playwright/test";

// WI-009 PoC verification — the dev server should already be running on :5174
// (the project's `pnpm dev`). If it isn't, playwright will start one.

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:5174",
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
    command: "pnpm dev",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
