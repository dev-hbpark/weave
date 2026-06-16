// Shared present-mode ink e2e helpers (WI-239 / WI-240).

import { expect, type Page } from "@playwright/test";
import { addFrame } from "./helpers.js";

/** Force the page offline (so persistence routes through localStorage, not the
 *  e2e dev server's absent `/api`) before any navigation. Per-page; for a
 *  second page in the same context that must read the SAME design, call this on
 *  that page too — they share the context's localStorage. */
export async function forceOfflineInit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
  });
}

/** Create a slide-deck via the wizard WITHOUT the shared helper's
 *  `waitForLoadState("networkidle")` step (which never settles in this sandbox
 *  — documented baseline, WI-153). Gates on the editor handshake instead. */
export async function createDeckNoIdle(page: Page, title: string): Promise<string> {
  await forceOfflineInit(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("weave.dev.unlock-flavors", "1"));
  await page.getByTestId("landing-new-design").click();
  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(title);
  await page.getByTestId("new-design-flavor-slide-deck").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
      __weaveVm?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined && w.__weaveVm !== undefined;
  });
  const match = new URL(page.url()).pathname.match(/^\/design\/([^/]+)$/);
  if (match === null) throw new Error(`unexpected URL: ${page.url()}`);
  return match[1] as string;
}

/** Create a one-slide deck and enter present mode; returns the design id. */
export async function enterPresentDeck(page: Page, title = "Ink E2E"): Promise<string> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await createDeckNoIdle(page, title);
  await addFrame(page, "slide", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } });
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("ink-toolbar")).toBeVisible();
  return id;
}
