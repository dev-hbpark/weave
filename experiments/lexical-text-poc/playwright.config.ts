import { defineConfig, devices } from "@playwright/test";

/**
 * PoC 의 e2e 는 자동화 가능한 mechanical 검증에 한정:
 * - StrictMode 더블 마운트 / unmount / remount sequence
 * - 2-actor concurrent edit (양쪽 editor sync)
 * - CDP IME composition (한국어 합성 입력의 *부분* 자동화 — manual 의 대체 아님)
 *
 * 실제 한국어 IME 의 OS-native jamo 결합은 CDP 로 재현 불가. 4-browser manual
 * (Galaxy Chrome / iOS Safari / Mac Chrome / Mac Safari) 이 production
 * confidence 의 source. 이 자동화는 mechanical 회귀를 빠르게 catch 하는 보강.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // 단일 dev server 공유
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
