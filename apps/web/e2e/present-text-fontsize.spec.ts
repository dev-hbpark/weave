// WI-059 / present mode — a text item with a `ratio` fontSizeSpec resolves to
// `value × the containing frame's height in design-px`. That height reaches the
// text renderer through `ParentFrameHeightContext`. Edit mode supplies it via
// FrameStage's NestedFrame; present mode renders through `PresentFrameTree`,
// which must supply the SAME height — otherwise the context default (0) makes
// every ratio-sized text resolve to `value × 0 = 0px` and vanish.
//
// Regression guard: present-mode ratio text must render at the same px size it
// does in edit mode (here 0.1 × 864px slide height = 86.4px), never 0.

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

test("ratio-sized text inside a slide renders at the correct (non-zero) size in present mode", async ({
  page,
}) => {
  await setupFakeCloud(page);
  await clearAllDesigns(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const id = await prepareDesign(page, { flavor: "mixed", title: "TXT-SIZE", online: true });

  // A slide that is 0.8 of the (1080px-tall) design → 864px tall.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
  });
  const slide = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    const f = (w.__weaveDoc?.root.children ?? []).find((c) => c.kind === "frame");
    return f ? String(f.id) : "";
  });
  expect(slide).not.toBe("");

  // Text child with a RATIO fontSizeSpec (0.1 of the slide height).
  await page.evaluate((containerId) => {
    const w = window as unknown as { __weaveEditor?: { exec: (c: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.add", {
      kind: "text",
      containerId,
      frame: { x: 0.1, y: 0.4, width: 0.8, height: 0.2, rotation: 0 },
      attrsOverride: { text: "HELLO PRESENT", fontSizeSpec: { kind: "ratio", value: 0.1 } },
    });
  }, slide);
  await page.waitForTimeout(300);

  // Edit-mode baseline: 0.1 × 864 = 86.4px.
  const editFont = await page.evaluate(() => {
    const el = document.querySelector(
      "[data-testid='text-block'] [data-text-content]",
    ) as HTMLElement | null;
    return el ? getComputedStyle(el).fontSize : null;
  });
  expect(editFont).toBe("86.4px");

  await saveToCloud(page);

  await page.goto(`/design/${id}/present`);
  await expect(page.getByTestId("present-empty")).toHaveCount(0);
  await page.waitForTimeout(500);

  const presentFont = await page.evaluate(() => {
    const el = document.querySelector(
      "[data-testid='text-block'] [data-text-content]",
    ) as HTMLElement | null;
    return el ? getComputedStyle(el).fontSize : null;
  });
  // Must equal the edit-mode size — and crucially never 0px.
  expect(presentFont).toBe("86.4px");
});
