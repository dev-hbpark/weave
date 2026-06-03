// Image-upload outbox (IndexedDB).
//
// When an image upload can't reach the cloud the bytes are queued in
// IndexedDB (`weave-resource-outbox`) so they survive a reload, and
// `flushResourceOutbox` re-uploads them once the server is reachable again
// — then deletes the queue entry. This mirrors the design read-cache
// fallback (DR-045): the user's just-uploaded image is not lost to a blip.
//
// The e2e dev server serves no `/api/resources`, so we stand up a fake
// endpoint with a flip-able outage and assert the queue fills on failure
// and drains on recovery.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const CLOUD_SRC = "https://cdn.example.com/uploaded-tiny.png";

/** Fake `/api/resources` with a flip-able outage. POST answers 500 while
 *  `state.down`, otherwise 200 with a canonical cloud resource. */
async function setupFakeResourceApi(page: Page): Promise<{ state: { down: boolean } }> {
  const state = { down: true };
  await page.route("**/api/resources", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") {
      // bootstrapFromCloud GETs the list on mount — keep it empty + healthy.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ resources: [] }),
      });
      return;
    }
    if (state.down) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "DOWN", message: "resource api down" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resource: {
          id: "image-cloud-1",
          kind: "image",
          src: CLOUD_SRC,
          name: "tiny.png",
          addedAt: "2026-06-03T00:00:00.000Z",
          sessionOnly: false,
        },
      }),
    });
  });
  return { state };
}

/** Count rows in the IndexedDB outbox from inside the page. Mirrors the
 *  module's schema so a read before the app first writes still resolves. */
function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("weave-resource-outbox", 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pending")) {
            db.createObjectStore("pending", { keyPath: "id" });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("pending")) {
            resolve(0);
            db.close();
            return;
          }
          const tx = db.transaction("pending", "readonly");
          const c = tx.objectStore("pending").count();
          c.onsuccess = () => {
            resolve(c.result);
            db.close();
          };
          c.onerror = () => {
            resolve(-1);
            db.close();
          };
        };
        req.onerror = () => resolve(-1);
      }),
  );
}

/** True when localStorage holds a resource record whose src is the cloud URL. */
function hasCloudResource(page: Page): Promise<boolean> {
  return page.evaluate((cloudSrc) => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key === null || !key.startsWith("weave.resource.v1.")) continue;
      const raw = window.localStorage.getItem(key);
      if (raw?.includes(cloudSrc)) return true;
    }
    return false;
  }, CLOUD_SRC);
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
  // Start every run from an empty outbox so a prior run can't leak rows.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const del = indexedDB.deleteDatabase("weave-resource-outbox");
        del.onsuccess = () => resolve();
        del.onerror = () => resolve();
        del.onblocked = () => resolve();
      }),
  );
});

test("failed image upload is queued in IndexedDB, then uploaded and removed on reconnect", async ({
  page,
}) => {
  const { state } = await setupFakeResourceApi(page); // starts DOWN
  await prepareDesign(page, { flavor: "mixed", title: "Outbox" });

  // Upload an image while the resource API is down.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  // The dialog reports the fallback and stays usable.
  await expect(page.getByTestId("media-src-upload-warning")).toBeVisible();
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("img").first()).toHaveAttribute("src", /^data:image\/png/);

  // The bytes were queued for retry.
  await expect.poll(() => outboxCount(page), { timeout: 8_000 }).toBe(1);
  expect(await hasCloudResource(page)).toBe(false);

  // Server comes back. The `online` event drains the outbox: re-upload, then
  // delete the queue entry, and the LS record swaps to the cloud URL.
  state.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect.poll(() => outboxCount(page), { timeout: 8_000 }).toBe(0);
  await expect.poll(() => hasCloudResource(page), { timeout: 8_000 }).toBe(true);
});

test("queued upload survives a reload and drains on the next boot", async ({ page }) => {
  const { state } = await setupFakeResourceApi(page); // DOWN
  await prepareDesign(page, { flavor: "mixed", title: "Outbox reload" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByTestId("media-src-upload-warning")).toBeVisible();
  await page.getByTestId("media-src-confirm").click();
  await expect.poll(() => outboxCount(page), { timeout: 8_000 }).toBe(1);

  // Bring the server up, then reload — the boot-time flush (App.tsx) drains it.
  state.down = false;
  await page.goto("/");
  await expect.poll(() => outboxCount(page), { timeout: 8_000 }).toBe(0);
  await expect.poll(() => hasCloudResource(page), { timeout: 8_000 }).toBe(true);
});
