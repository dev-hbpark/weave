// WI-072 — a frame opted OUT of the slide deck (`attrs.presentable: false`)
// is removed from the *navigation step list* (it is not a slide page you can
// step to), but it MUST still render on the presentation screen as visual
// content. Excluding a frame from the deck is not a visibility toggle.
//
// Regression guard: before the fix, a non-slide frame was excluded from
// `cameraTargets` (correct) AND never rendered anywhere (bug) — it appeared
// in neither `rootPrimitiveScenes` (skips all frame kinds) nor in any parent
// `PresentFrameTree` (which skips nested frames expecting them to own a
// scene). The fix renders it as a non-navigable scene.
//
// Present mode is server-first (`preferCloud`), so the deck must be saved to
// the cloud before navigating — we stand up the same fake in-memory cloud as
// present-offline-fallback.spec.ts.

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

test("a non-slide frame still renders in present mode but is not a navigation step", async ({
  page,
}) => {
  await setupFakeCloud(page);
  await clearAllDesigns(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const id = await prepareDesign(page, { flavor: "mixed", title: "P-NONSLIDE", online: true });

  // Two frames at the design root.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.6, y: 0.6, width: 0.3, height: 0.3, rotation: 0 },
  });

  // Opt the SECOND frame out of the deck (presentable: false).
  const optedOut = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
      __weaveEditor?: { exec: (cmd: string, input: unknown) => unknown };
    };
    const frames = w.__weaveDoc?.root.children.filter((c) => c.kind === "frame") ?? [];
    const target = frames[1];
    if (target === undefined || w.__weaveEditor === undefined) return "";
    const itemId = String(target.id);
    w.__weaveEditor.exec("weave.item.update", { itemId, attrs: { presentable: false } });
    return itemId;
  });
  expect(optedOut).not.toBe("");

  await saveToCloud(page);

  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-empty")).toHaveCount(0);

  // The opted-out frame is NOT a navigation step (no camera-target scene
  // carries its id) …
  await expect(
    page.locator(`[data-testid='present-scene'][data-entry-id='${optedOut}']`),
  ).toHaveCount(0);

  // … but it STILL renders on the presentation screen as a non-navigable scene.
  await expect(
    page.locator(`[data-testid='present-nonslide-frame'][data-item-id='${optedOut}']`),
  ).toHaveCount(1);

  // The other frame remains a navigable slide step.
  await expect(page.getByTestId("present-scene").first()).toBeVisible();
});

/** Frame ids (document order) within `containerId`, or root when omitted. */
async function frameIds(
  page: import("@playwright/test").Page,
  containerId?: string,
): Promise<string[]> {
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

test("an excluded CHILD frame renders inline inside its presentable parent slide", async ({
  page,
}) => {
  await setupFakeCloud(page);
  await clearAllDesigns(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const id = await prepareDesign(page, { flavor: "mixed", title: "P-CHILD", online: true });

  // A presentable parent slide …
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
  });
  await expect.poll(async () => (await frameIds(page)).length).toBe(1);
  const [parent] = await frameIds(page);

  // … containing a child frame that the user opts OUT of the deck.
  await addFrame(page, "slide", {
    containerId: parent,
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
  });
  await expect.poll(async () => (await frameIds(page, parent)).length).toBe(1);
  const [child] = await frameIds(page, parent);

  await page.evaluate((itemId) => {
    const w = window as unknown as { __weaveEditor?: { exec: (c: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", { itemId, attrs: { presentable: false } });
  }, child);

  await saveToCloud(page);

  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-empty")).toHaveCount(0);

  // The parent is the (only) navigation step.
  await expect(
    page.locator(`[data-testid='present-scene'][data-entry-id='${parent}']`),
  ).toHaveCount(1);
  // The excluded child is NOT a navigation step …
  await expect(page.locator(`[data-testid='present-scene'][data-entry-id='${child}']`)).toHaveCount(
    0,
  );
  // … and it does NOT get a standalone non-slide scene (it is drawn inline) …
  await expect(
    page.locator(`[data-testid='present-nonslide-frame'][data-item-id='${child}']`),
  ).toHaveCount(0);

  // … instead it renders inline inside the parent slide's scene and is VISIBLE
  // (regression: it used to be classified `hidden` / opacity 0 by the camera's
  // z-order dim because every scene sat in the active subtree).
  const inlineChild = page.locator(`[data-testid='present-primitive'][data-item-id='${child}']`);
  await expect(inlineChild).toHaveCount(1);
  await expect(inlineChild).toBeVisible();
});
