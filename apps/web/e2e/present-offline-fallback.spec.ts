// Present mode is server-first (`preferCloud`), but a deck the user opens
// while the cloud is unreachable must still render instead of an empty
// stage. Under the offline-first model a normally-synced design has NO
// `weave.design.v5.<id>` outbox entry, so the fallback rides a SEPARATE,
// prompt-free read-cache (`weave.design.cache.v5.<id>`) that `useDesign`
// writes on every successful cloud load and reads only in present mode.
//
// The e2e dev server serves no `/api/designs` backend, so we stand up a
// fake in-memory cloud with a togglable outage, exactly like
// cloud-only-reopen.spec.ts.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

interface StoredDesign {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background?: string;
  readonly meta: { readonly createdAt: string; readonly updatedAt: string };
  readonly [k: string]: unknown;
}

/** Fake cloud keyed by design id with a flip-able outage. When `state.down`
 *  is true every route answers 500 so the client's cloud layer treats the
 *  backend as unreachable. */
async function setupFakeCloud(page: Page): Promise<{
  cloud: Map<string, StoredDesign>;
  state: { down: boolean };
}> {
  const cloud = new Map<string, StoredDesign>();
  const state = { down: false };

  const fail = async (route: import("@playwright/test").Route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "CLOUD_DOWN", message: "cloud unreachable" } }),
    });
  };

  await page.route("**/api/designs", async (route) => {
    if (state.down) return fail(route);
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}") as StoredDesign;
      cloud.set(body.id, body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, id: body.id }),
      });
      return;
    }
    const designs = [...cloud.values()].map((d) => ({
      id: d.id,
      title: d.title,
      width: d.width,
      height: d.height,
      background: d.background ?? "#ffffff",
      createdAt: d.meta.createdAt,
      updatedAt: d.meta.updatedAt,
    }));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ designs }),
    });
  });

  await page.route("**/api/designs/*", async (route) => {
    if (state.down) return fail(route);
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const d = cloud.get(id);
    if (d === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Design not found" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ design: d }),
    });
  });

  return { cloud, state };
}

/** Click manual save and wait for the cloud POST to land. */
async function saveToCloud(page: Page): Promise<void> {
  const posted = page.waitForResponse(
    (r) => r.url().includes("/api/designs") && r.request().method() === "POST",
  );
  await page.getByTestId("toolbar-save").click();
  await posted;
}

const cacheKey = (id: string) => `weave.design.cache.v5.${id}`;
const outboxKey = (id: string) => `weave.design.v5.${id}`;

test("present mode falls back to the local cache when the cloud is unreachable", async ({
  page,
}) => {
  const { cloud, state } = await setupFakeCloud(page);
  await clearAllDesigns(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Build a 1-frame deck that lives ONLY in the cloud (online create + save
  // never writes the offline outbox), so the present fallback can come from
  // nothing but the new read-cache.
  const id = await prepareDesign(page, { title: "Cache deck", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  expect(cloud.get(id)).toBeDefined();

  // No offline outbox entry exists for this id.
  expect(await page.evaluate((k) => window.localStorage.getItem(k), outboxKey(id))).toBeNull();

  // Present with the cloud UP — the deck renders and the read-cache is written.
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();
  await expect(page.getByTestId("present-empty")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((k) => window.localStorage.getItem(k), cacheKey(id)))
    .not.toBeNull();

  // Cloud goes down. Reopen present — it must fall back to the cached deck
  // instead of the empty stage.
  state.down = true;
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();
  await expect(page.getByTestId("present-empty")).toHaveCount(0);
});

test("present mode shows the empty stage when the cloud is down and nothing is cached", async ({
  page,
}) => {
  const { cloud, state } = await setupFakeCloud(page);
  await clearAllDesigns(page);

  // A deck exists in the cloud but was NEVER opened on this client, so no
  // read-cache was ever written. With the cloud down there is genuinely
  // nothing local to show.
  const id = await prepareDesign(page, { title: "Never cached", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  expect(cloud.get(id)).toBeDefined();

  await page.evaluate((k) => window.localStorage.removeItem(k), cacheKey(id));
  state.down = true;

  await page.goto(`/design/${id}/present`);
  // Loading resolves (cloud failed) and, with no cache, the empty stage shows.
  await expect(page.getByTestId("present-empty")).toBeVisible();
});
