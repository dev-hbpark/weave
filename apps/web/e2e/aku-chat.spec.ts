// WI-052 — 아쿠 (Aku) chat agent e2e. The runtime-wire gate: not just "the UI
// renders" but "Aku's edits are REAL, undoable canvas transactions" (mock token
// stream, real editor.exec path). Backend is the mock transport; the canvas
// edits go through the same History contract as any user action.

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

async function docBackground(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { attrs?: { background?: string | null } } };
    return w.__weaveDoc?.attrs?.background ?? null;
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

test("sending a prompt streams an assistant reply", async ({ page }) => {
  await openAku(page);
  await composer(page).fill("안녕 아쿠");
  await composer(page).press("Enter");

  // user turn shows immediately; assistant streams in.
  await expect(page.locator('[data-aku-message="user"]')).toContainText("안녕 아쿠");
  const assistant = page.locator('[data-aku-message="assistant"]').last();
  await expect(assistant).not.toHaveText("", { timeout: 4000 });
  await expect(assistant).toContainText("아쿠", { timeout: 4000 });
});

test("design-aware: '배경을 파랑으로' actually sets the background AND is undoable", async ({
  page,
}) => {
  await openAku(page);
  const before = await docBackground(page);

  await composer(page).fill("배경을 파랑으로 바꿔줘");
  await composer(page).press("Enter");

  // The edit chip appears once the tool-call executed via editor.exec.
  await expect(page.locator('[data-aku-edit="setBackground"]')).toBeVisible({ timeout: 5000 });
  // The REAL document changed — not a UI illusion.
  await expect.poll(() => docBackground(page), { timeout: 5000 }).toBe("#3b82f6");

  // Aku's edit is a normal undoable transaction (History contract).
  await page.evaluate(() => {
    const w = window as unknown as { __weaveEditor?: { history: { undo: () => void } } };
    w.__weaveEditor?.history.undo();
  });
  await expect.poll(() => docBackground(page), { timeout: 3000 }).toBe(before);
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
  // Seed a child via Aku so there's something a stray Delete could remove.
  await composer(page).fill("텍스트 추가해줘");
  await composer(page).press("Enter");
  await expect(page.locator('[data-aku-edit="addItem"]')).toBeVisible({ timeout: 5000 });
  const childCount = await page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<unknown> } } };
    return w.__weaveDoc?.root.children.length ?? 0;
  });

  // Type + press Backspace/Delete WHILE the composer is focused — must edit the
  // text field, never delete a canvas item.
  await composer(page).fill("지울 텍스트");
  await composer(page).press("Backspace");
  await composer(page).press("Delete");
  await expect(
    page.evaluate(() => {
      const w = window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
      };
      return w.__weaveDoc?.root.children.length ?? 0;
    }),
  ).resolves.toBe(childCount);
});
