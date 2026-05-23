// Phase 10b — shared helpers for e2e specs. The wizard creates a new Design
// with a fresh id each run; specs walk through it once and then exercise the
// design page. `prepareDesign` clears v5 storage from prior runs, walks the
// wizard with the requested flavor, and returns the design id (parsed from
// the URL).

import type { Page } from "@playwright/test";
import type { DocFlavor } from "../src/document/types.js";

export async function clearAllDesigns(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith("weave.design.v5.")) {
        window.localStorage.removeItem(key);
      }
    }
  });
}

interface PrepareOptions {
  readonly flavor?: DocFlavor;
  /** Default 16:9. */
  readonly presetId?: string;
  readonly title?: string;
}

/** Walk the new-design wizard and land on /design/:id. Returns the id. */
export async function prepareDesign(
  page: Page,
  { flavor = "mixed", presetId = "16:9", title = "E2E design" }: PrepareOptions = {},
): Promise<string> {
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();

  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(title);

  await page.getByTestId(`new-design-flavor-${flavor}`).click();
  await page.getByTestId(`new-design-size-${presetId}`).click();
  await page.getByTestId("new-design-create").click();

  await page.waitForURL(/\/design\/[^/]+$/);
  const url = new URL(page.url());
  const match = url.pathname.match(/^\/design\/([^/]+)$/);
  if (match === null) throw new Error(`unexpected URL after wizard: ${url.pathname}`);
  return match[1] as string;
}
