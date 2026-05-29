// Offline-first persistence (2026-05-29).
//
// Model: the cloud (`apps/web/api/designs/*`) is the source of truth; a
// `weave.design.v5.<id>` entry in localStorage means an UNSYNCED OFFLINE
// EDIT, written only while offline. Opening a design:
//   • no local copy  → load the authoritative cloud document (this is the
//     fix for "save returns ok but reopening shows no changes" — a stale
//     LS read-cache no longer shadows newer cloud saves);
//   • local copy     → prompt to reconcile (저장 uploads it, 버리기 drops
//     it and loads the server copy).
//
// The e2e dev server is pure Vite and serves no `/api/designs` backend, so
// these specs stand up a fake in-memory cloud via route interception.

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

/** Stand up a fake cloud keyed by design id, wired to `/api/designs*`. */
async function setupFakeCloud(page: Page): Promise<Map<string, StoredDesign>> {
  const cloud = new Map<string, StoredDesign>();

  await page.route("**/api/designs", async (route) => {
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

  return cloud;
}

/** Root child (frame) count of the live document via the DEV global. */
async function rootChildCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<unknown> } } };
    return w.__weaveDoc?.root.children.length ?? -1;
  });
}

/** Click manual save and wait for the cloud POST to land. */
async function saveToCloud(page: Page): Promise<void> {
  const posted = page.waitForResponse(
    (r) => r.url().includes("/api/designs") && r.request().method() === "POST",
  );
  await page.getByTestId("toolbar-save").click();
  await posted;
}

const lsKey = (id: string) => `weave.design.v5.${id}`;

test("online reopen reflects the latest cloud save (no local copy shadows it)", async ({
  page,
}) => {
  const cloud = await setupFakeCloud(page);
  await clearAllDesigns(page);

  // Create a design, add two frames, save online each time.
  const id = await prepareDesign(page, { title: "Online reopen", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  await addFrame(page, "slide");
  await saveToCloud(page);
  await expect.poll(() => rootChildCount(page)).toBe(2);

  // Online saves never write localStorage (and a successful save clears
  // any outbox entry) — so there is no local copy to shadow the cloud.
  const lsAfterSave = await page.evaluate((k) => window.localStorage.getItem(k), lsKey(id));
  expect(lsAfterSave).toBeNull();
  expect([...cloud.values()][0]).toBeDefined();

  // Reopen — the authoritative cloud document loads, no reconcile prompt.
  await page.goto(`/design/${id}`);
  await expect.poll(() => rootChildCount(page), { timeout: 8_000 }).toBe(2);
  await expect(page.getByTestId("local-conflict-dialog")).toHaveCount(0);
});

function childCountOf(d: StoredDesign | undefined): number {
  const children = (d as { document?: { root?: { children?: unknown[] } } } | undefined)?.document
    ?.root?.children;
  return Array.isArray(children) ? children.length : -1;
}

test("opening a design with an offline copy prompts; 저장 saves it as a NEW design", async ({
  page,
}) => {
  const cloud = await setupFakeCloud(page);
  await clearAllDesigns(page);

  // Build two real blobs: a 1-frame (server) and a 2-frame (offline edit).
  const id = await prepareDesign(page, { title: "Offline save", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  const blob1 = structuredClone(cloud.get(id)); // server: 1 frame
  await addFrame(page, "slide");
  await saveToCloud(page);
  const blob2 = structuredClone(cloud.get(id)); // 2 frames
  expect(blob1).toBeDefined();
  expect(blob2).toBeDefined();

  // Leave the editor so any pending debounced auto-save settles before we
  // arrange the cloud state — otherwise a late save would re-POST the
  // 2-frame doc under `id` after our reset below.
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Arrange the conflict: cloud holds the 1-frame version, localStorage
  // holds the 2-frame version as an unsynced offline edit.
  cloud.set(id, blob1 as StoredDesign);
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: lsKey(id),
    value: JSON.stringify(blob2),
  });

  // Reopen — the prompt appears over the painted offline copy (2 frames).
  await page.goto(`/design/${id}`);
  await expect(page.getByTestId("local-conflict-dialog")).toBeVisible();
  await expect.poll(() => rootChildCount(page)).toBe(2);

  // 새 디자인으로 저장 → the offline copy is written to the server as a NEW
  // design, the original is left untouched, and we navigate to the new one.
  await page.getByTestId("local-conflict-save").click();
  await expect(page.getByTestId("local-conflict-dialog")).toHaveCount(0);
  await page.waitForURL(
    (url) => /\/design\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(id),
  );
  const newId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(newId).not.toBe(id);

  // Editor shows the new design (2 frames); original outbox cleared.
  await expect.poll(() => rootChildCount(page), { timeout: 8_000 }).toBe(2);
  await expect
    .poll(() => page.evaluate((k) => window.localStorage.getItem(k), lsKey(id)))
    .toBeNull();

  // Server: original untouched (1 frame), new design added (2 frames).
  expect(cloud.size).toBe(2);
  expect(childCountOf(cloud.get(id))).toBe(1);
  expect(childCountOf(cloud.get(newId))).toBe(2);
  expect(String((cloud.get(newId) as StoredDesign).title)).toContain("오프라인 사본");
});

test("opening a design with an offline copy prompts; 버리기 loads the server version", async ({
  page,
}) => {
  const cloud = await setupFakeCloud(page);
  await clearAllDesigns(page);

  // Server: 2 frames. Offline outbox: a stale 1-frame copy.
  const id = await prepareDesign(page, { title: "Offline discard", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  const blob1 = structuredClone(cloud.get(id)); // 1 frame
  await addFrame(page, "slide");
  await saveToCloud(page);
  // cloud now holds 2 frames; seed LS with the stale 1-frame copy.
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: lsKey(id),
    value: JSON.stringify(blob1),
  });

  await page.goto(`/design/${id}`);
  await expect(page.getByTestId("local-conflict-dialog")).toBeVisible();
  // Painted offline copy = 1 frame while the prompt is up.
  await expect.poll(() => rootChildCount(page)).toBe(1);

  // 버리기 → drop the offline copy, load the 2-frame server version.
  await page.getByTestId("local-conflict-discard").click();
  await expect(page.getByTestId("local-conflict-dialog")).toHaveCount(0);
  await expect.poll(() => rootChildCount(page), { timeout: 8_000 }).toBe(2);
  await expect
    .poll(() => page.evaluate((k) => window.localStorage.getItem(k), lsKey(id)))
    .toBeNull();
});

test("presentation mode is server-first — cloud content overrides a stale local copy", async ({
  page,
}) => {
  // Fake cloud with a toggleable reachability so we can compare the local
  // fallback against the server copy in one run.
  const cloud = new Map<string, StoredDesign>();
  let serverUp = true;

  await page.route("**/api/designs", async (route) => {
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ designs: [] }),
    });
  });
  await page.route("**/api/designs/*", async (route) => {
    if (!serverUp) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "KV_UNAVAILABLE" } }),
      });
      return;
    }
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const d = cloud.get(id);
    await route.fulfill(
      d === undefined
        ? { status: 404, contentType: "application/json", body: JSON.stringify({ error: {} }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify({ design: d }) },
    );
  });

  await clearAllDesigns(page);

  // Build a 2-frame server design and a stale 1-frame blob.
  const id = await prepareDesign(page, { title: "Present server-first", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  const blob1 = structuredClone(cloud.get(id)); // 1 frame
  await addFrame(page, "slide");
  await saveToCloud(page);
  const blob2 = structuredClone(cloud.get(id)); // 2 frames

  // Settle pending auto-saves, then pin cloud = 2 frames and seed a stale
  // 1-frame offline copy.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  cloud.set(id, blob2 as StoredDesign);
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: lsKey(id),
    value: JSON.stringify(blob1),
  });

  // Phase A — server unreachable: present mode falls back to the local copy.
  serverUp = false;
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();
  const localSceneCount = await page.getByTestId("present-scene").count();
  expect(localSceneCount).toBeGreaterThan(0);

  // Phase B — server reachable: present mode shows the richer cloud copy.
  serverUp = true;
  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();
  await expect
    .poll(() => page.getByTestId("present-scene").count(), { timeout: 8_000 })
    .toBeGreaterThan(localSceneCount);
});

test("presentation mode renders a cloud design with NO local copy (no Rules-of-Hooks crash)", async ({
  page,
}) => {
  // Regression for React #310: with no local copy present mode paints blank
  // (0 camera targets → early return) on the first render, then the cloud
  // copy arrives and camera targets appear. A hook placed after that early
  // return would be reached only on the second render → "rendered more hooks
  // than during the previous render" and a blank, crashed page.
  const cloud = new Map<string, StoredDesign>();
  await page.route("**/api/designs", async (route) => {
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ designs: [] }),
    });
  });
  await page.route("**/api/designs/*", async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const d = cloud.get(id);
    await route.fulfill(
      d === undefined
        ? { status: 404, contentType: "application/json", body: JSON.stringify({ error: {} }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify({ design: d }) },
    );
  });

  await clearAllDesigns(page);
  const id = await prepareDesign(page, { title: "Present no-local", online: true });
  await addFrame(page, "slide");
  await saveToCloud(page);
  await addFrame(page, "slide");
  await saveToCloud(page);

  // Drop the local copy entirely so the open hits the blank → cloud path.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate((k) => window.localStorage.removeItem(k), lsKey(id));

  const hookErrors: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/order of Hooks|more hooks|#310/i.test(t)) hookErrors.push(t);
  });
  page.on("pageerror", (e) => {
    if (/Minified React error #310|more hooks/i.test(e.message)) hookErrors.push(e.message);
  });

  await page.goto(`/design/${id}/present`);
  // Renders scenes (would be 0 on a #310 crash) and logs no hooks error.
  await expect
    .poll(() => page.getByTestId("present-scene").count(), { timeout: 8_000 })
    .toBeGreaterThan(0);
  expect(hookErrors).toEqual([]);
  // The "no slides" empty state must not linger once the design has loaded.
  await expect(page.getByTestId("present-empty")).toHaveCount(0);
});

test("presentation mode shows a loading screen, and the empty state only when truly empty", async ({
  page,
}) => {
  // No local copy and the cloud has nothing for this id → present mode shows
  // the loading screen while fetching, then the genuine "no slides" empty
  // state (not a flash before content, and not a crash).
  await page.route("**/api/designs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ designs: [] }),
    });
  });
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/designs/*", async (route) => {
    // Hold the response briefly so the loading screen is observable.
    await gate;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "NOT_FOUND" } }),
    });
  });

  await clearAllDesigns(page);
  await page.goto("/design/does-not-exist-xyz/present");

  // Loading screen while the (gated) cloud fetch is in flight.
  await expect(page.getByTestId("present-loading")).toBeVisible();
  await expect(page.getByTestId("present-empty")).toHaveCount(0);

  // Release the 404 → load resolves to nothing → genuine empty state.
  release?.();
  await expect(page.getByTestId("present-empty")).toBeVisible();
  await expect(page.getByTestId("present-loading")).toHaveCount(0);
});
