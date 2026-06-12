// WI-194 / DR-127 — page-bounded deck source (DeckPolicy).
//
// Product model: in slide-deck (and doc-page) ONLY frames added AS pages
// (root-direct) are slides; a frame created INSIDE a page (toolbar add via
// WI-180 scoped insertion, Cmd+G group wrapper via WI-185, paste) is a
// structural group — never a rail tile, never a presentation step. There is
// deliberately no deck toggle on the page-lifecycle rail (DR-114 §4), so
// without the read-time filter a polluted tile had no recovery UI.
//
// Mixed keeps the WI-072 model unchanged: every frame at any depth is a deck
// candidate unless opted out (`presentable: false`).

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

/** Frame ids (document order) within `containerId`, or root when omitted. */
async function frameIds(page: Page, containerId?: string): Promise<string[]> {
  return page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: { root: { id: unknown; kind?: string; children: ReadonlyArray<unknown> } };
    };
    const root = w.__weaveDoc?.root;
    if (!root) return [];
    type N = { id: unknown; kind?: string; children: ReadonlyArray<N> };
    const find = (n: N, id: string): N | undefined => {
      if (String(n.id) === id) return n;
      for (const c of n.children) {
        const r = find(c, id);
        if (r) return r;
      }
      return undefined;
    };
    const scope = cid ? find(root as unknown as N, cid) : (root as unknown as N);
    const out: string[] = [];
    const walk = (n: N) => {
      for (const c of n.children) {
        if (c.kind === "frame") out.push(String(c.id));
        walk(c);
      }
    };
    if (scope) walk(scope);
    return out;
  }, containerId);
}

async function railTileIds(page: Page): Promise<string[]> {
  return page
    .locator("[data-thumbnail-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-thumbnail-id") ?? ""));
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("slide-deck: a frame added INSIDE the page never becomes a rail tile", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  const [pageId] = await railTileIds(page);
  expect(pageId).toBeTruthy();

  // What the toolbar add does in slide-deck (InsertionPolicy.addIntoActivePage).
  await addFrame(page, "frame", { containerId: pageId });
  await expect.poll(async () => (await frameIds(page, pageId)).length).toBe(1);

  // The nested frame is a group, not a slide — the rail stays one tile.
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  expect(await railTileIds(page)).toEqual([pageId]);
});

test("slide-deck: Cmd+G's wrapper frame stays out of the rail (WI-185 leak closed)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const [pageId] = await railTileIds(page);

  // Two elements on the page, grouped — `weave.items.group` wraps them in a
  // new (unstamped) frame nested inside the page.
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId: pageId,
    frame: { x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0 },
  });
  const shapeIds = await page.evaluate((cid) => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
    };
    type N = { id: unknown; kind?: string; children: ReadonlyArray<N> };
    const root = w.__weaveDoc?.root as unknown as N | undefined;
    const pageNode = root?.children.find((c) => String((c as N).id) === cid) as N | undefined;
    return (pageNode?.children ?? []).filter((c) => c.kind === "shape").map((c) => String(c.id));
  }, pageId);
  expect(shapeIds).toHaveLength(2);

  await setSelection(page, shapeIds);
  await page.keyboard.press("ControlOrMeta+g");

  // The wrapper frame exists, nested inside the page …
  await expect.poll(async () => (await frameIds(page, pageId)).length).toBe(1);
  // … but the rail is unpolluted: still exactly the one page tile.
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  expect(await railTileIds(page)).toEqual([pageId]);
});

test("mixed: a nested frame is still a deck tile (WI-072 model unchanged)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });

  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
  });
  await expect.poll(async () => (await frameIds(page)).length).toBe(1);
  const [parent] = await frameIds(page);

  await addFrame(page, "frame", {
    containerId: parent,
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  await expect.poll(async () => (await frameIds(page, parent)).length).toBe(1);
  const [child] = await frameIds(page, parent);

  // Free placement: any-depth frames are deck candidates → two tiles.
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  expect(await railTileIds(page)).toEqual([parent, child]);
});

// ─── Present mode — nested frames render INLINE in their page's scene ───────
// Present is server-first (`preferCloud`): stand up the same fake in-memory
// cloud as present-nonslide-frame.spec.ts and save before navigating.

interface StoredDesign {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly background?: string;
  readonly meta: { readonly createdAt: string; readonly updatedAt: string };
  readonly [k: string]: unknown;
}

async function setupFakeCloud(page: Page): Promise<void> {
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
}

async function saveToCloud(page: Page): Promise<void> {
  const posted = page.waitForResponse(
    (r) => r.url().includes("/api/designs") && r.request().method() === "POST",
  );
  await page.getByTestId("toolbar-save").click();
  await posted;
}

test("slide-deck present: a nested frame is not a step and renders inline in the page's scene", async ({
  page,
}) => {
  await setupFakeCloud(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const id = await prepareDesign(page, { flavor: "slide-deck", title: "DECK-SRC", online: true });
  const [pageId] = await railTileIds(page);

  await addFrame(page, "frame", {
    containerId: pageId,
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
  });
  await expect.poll(async () => (await frameIds(page, pageId)).length).toBe(1);
  const [child] = await frameIds(page, pageId);

  await saveToCloud(page);

  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-empty")).toHaveCount(0);

  // The page is the (only) navigation step …
  await expect(
    page.locator(`[data-testid='present-scene'][data-entry-id='${pageId}']`),
  ).toHaveCount(1);
  // … the nested frame is neither a step nor a standalone non-slide scene …
  await expect(page.locator(`[data-testid='present-scene'][data-entry-id='${child}']`)).toHaveCount(
    0,
  );
  await expect(
    page.locator(`[data-testid='present-nonslide-frame'][data-item-id='${child}']`),
  ).toHaveCount(0);
  // … it renders INLINE inside the page's scene (no hole in the slide).
  const inlineChild = page.locator(`[data-testid='present-primitive'][data-item-id='${child}']`);
  await expect(inlineChild).toHaveCount(1);
  await expect(inlineChild).toBeVisible();
});
