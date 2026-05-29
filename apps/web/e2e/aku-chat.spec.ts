// WI-052 → WI-054 — 아쿠 (Aku) panel e2e. After WI-054 the agent loop lives on
// the small-think server (reverse-MCP), so the conversational assertions ("send
// a prompt → streamed reply → real edit") now require a running agent-server +
// model and live in a separate, server-dependent suite (not run in offline CI).
//
// What stays here is everything verifiable WITHOUT the agent: the panel shell
// (launch / close / drag / resize / first-run coachmark) and the load-bearing
// runtime invariant that typing in the composer never leaks into canvas hotkeys.
// The latter seeds its fixture item via `editor.exec` directly (not via Aku) so
// it needs no backend.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const composer = (page: Page) => page.getByLabel("아쿠에게 메시지");

async function openAku(page: Page): Promise<void> {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();
}

function childCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<unknown> } } };
    return w.__weaveDoc?.root.children.length ?? 0;
  });
}

test("launcher expands the panel; close collapses it", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  await expect(page.locator("[data-aku-panel]")).toHaveCount(0);

  await page.locator("[data-aku-launcher]").click();
  await expect(page.locator("[data-aku-panel]")).toBeVisible();

  await page.getByLabel("아쿠 닫기").click();
  await expect(page.locator("[data-aku-panel]")).toHaveCount(0);
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
});

test("first-run coachmark invites the first use, then stays dismissed", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  // First load: the discovery nudge is shown, anchored to the launcher.
  await expect(page.getByText("아쿠에게 맡겨보세요")).toBeVisible({ timeout: 4000 });

  await page.getByRole("button", { name: "알겠어요" }).click();
  await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);

  // Persisted (weave.coachmark.aku-intro) — silent on reload; launcher remains.
  await page.reload();
  await expect(page.locator("[data-aku-launcher]")).toBeVisible();
  await expect(page.getByText("아쿠에게 맡겨보세요")).toHaveCount(0);
});

test("launcher defaults to the top-left", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Aku-E2E" });
  const box = await page.locator("[data-aku-launcher]").boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? 999).toBeLessThan(200);
  expect(box?.y ?? 999).toBeLessThan(200);
});

test("panel can be dragged anywhere and the position persists", async ({ page }) => {
  await openAku(page);
  const panel = page.locator("[data-aku-panel]");
  const before = await panel.boundingBox();
  const handle = await page.locator("[data-aku-drag-handle]").boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  const hx = (handle?.x ?? 0) + (handle?.width ?? 0) / 2;
  const hy = (handle?.y ?? 0) + (handle?.height ?? 0) / 2;

  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 220, hy + 160, { steps: 10 });
  await page.mouse.up();

  const after = await panel.boundingBox();
  expect((after?.x ?? 0) - (before?.x ?? 0)).toBeGreaterThan(120);
  expect((after?.y ?? 0) - (before?.y ?? 0)).toBeGreaterThan(100);

  const geo = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("weave.aku.geometry") ?? "{}"),
  );
  expect(geo.x).toBeGreaterThan(100);
});

test("panel can be resized from the corner", async ({ page }) => {
  await openAku(page);
  const panel = page.locator("[data-aku-panel]");
  const b0 = await panel.boundingBox();
  const grip = await page.locator("[data-aku-resize]").boundingBox();
  expect(b0).not.toBeNull();
  expect(grip).not.toBeNull();
  const gx = (grip?.x ?? 0) + (grip?.width ?? 0) / 2;
  const gy = (grip?.y ?? 0) + (grip?.height ?? 0) / 2;

  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 140, gy + 110, { steps: 10 });
  await page.mouse.up();

  const b1 = await panel.boundingBox();
  expect((b1?.width ?? 0) - (b0?.width ?? 0)).toBeGreaterThan(80);
  expect((b1?.height ?? 0) - (b0?.height ?? 0)).toBeGreaterThan(60);
});

test("typing in the composer does not trigger canvas hotkeys", async ({ page }) => {
  await openAku(page);
  // Seed a child directly via the editor (NOT via Aku — this suite is backend-free)
  // so there's something a stray Delete could remove.
  await page.evaluate(() => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.add", { kind: "text" });
  });
  await expect.poll(() => childCount(page), { timeout: 4000 }).toBeGreaterThan(0);
  const seeded = await childCount(page);

  // Type + press Backspace/Delete WHILE the composer is focused — must edit the
  // text field, never delete a canvas item.
  await composer(page).fill("지울 텍스트");
  await composer(page).press("Backspace");
  await composer(page).press("Delete");
  await expect(childCount(page)).resolves.toBe(seeded);
});
