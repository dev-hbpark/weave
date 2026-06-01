// WI-073 — snap guide lines while dragging a frame. Dragging frame B so its left
// edge lands a few px short of frame A's left edge SNAPS it into exact alignment
// and shows the guide overlay (SnapFeedbackLayer). Verifies the agocraft move-
// snap (DR-036) wired through weave end-to-end.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Frame = { x: number; y: number; width: number; height: number };

async function addTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc: { root: { id: unknown } };
    };
    const root = String(w.__weaveDoc.root.id);
    // A (reference) top-left; B same size, far in BOTH axes so only the X-left
    // alignment is in play when we drag B horizontally toward A.
    w.__weaveEditor.exec("weave.item.add", {
      kind: "frame",
      containerId: root,
      frame: { x: 0.18, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
    });
    w.__weaveEditor.exec("weave.item.add", {
      kind: "frame",
      containerId: root,
      frame: { x: 0.6, y: 0.68, width: 0.2, height: 0.2, rotation: 0 },
    });
  });
  await page.waitForTimeout(180);
}

async function frames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc: { root: { children: ReadonlyArray<{ attrs: { frame?: Frame } }> } };
    };
    type Frame = { x: number; y: number; width: number; height: number };
    return w.__weaveDoc.root.children.map((c) => c.attrs.frame as Frame).filter(Boolean);
  });
}

test("WI-073 — dragging a frame near another snaps it into alignment + shows a guide", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-073-move-snap" });
  await addTwoFrames(page);

  const [a0, b0] = await frames(page);
  expect(a0).toBeTruthy();
  expect(b0).toBeTruthy();
  if (a0 === undefined || b0 === undefined) return;
  expect(b0.x).not.toBeCloseTo(a0.x, 2); // start misaligned

  const els = page.locator("[data-frame-id]");
  const aBox = await els.nth(0).boundingBox();
  const bBox = await els.nth(1).boundingBox();
  if (aBox === null || bBox === null) throw new Error("no frame boxes");

  // Drag B so its LEFT edge lands 3px to the right of A's left edge — inside the
  // 6px snap tolerance → it should lock to A's left exactly.
  const startX = bBox.x + 6;
  const startY = bBox.y + 6;
  const targetLeftX = aBox.x + 3; // 3px short of exact alignment
  const dx = targetLeftX - bBox.x;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(startX + (dx * i) / 6, startY);
    await page.waitForTimeout(12);
  }
  // Mid-drag (still pressed) the alignment guide overlay is shown.
  await expect(page.getByTestId("snap-feedback")).toBeVisible();
  await page.mouse.up();
  await page.waitForTimeout(120);

  const [a1, b1] = await frames(page);
  if (a1 === undefined || b1 === undefined) throw new Error("frames missing after drag");
  // B's left edge snapped to A's left edge → equal x (the 3px residual removed).
  expect(b1.x).toBeCloseTo(a1.x, 2);
  // The guide overlay clears after release.
  await expect(page.getByTestId("snap-feedback")).toHaveCount(0);
});

test("WI-073 #1 — grid-snap toggle flips, and a grid guide shows while dragging", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-073-grid" });
  // One lone frame (no alignment candidates).
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => unknown };
      __weaveDoc: { root: { id: unknown } };
    };
    w.__weaveEditor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc.root.id),
      frame: { x: 0.32, y: 0.34, width: 0.18, height: 0.18, rotation: 0 },
    });
  });
  await page.waitForTimeout(180);

  // The grid-snap toggle is off, then flips on (aria-pressed).
  const toggle = page.getByTestId("toolbar-grid-snap");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // With the grid on, dragging the lone frame surfaces a snap guide (a grid line
  // is always within tolerance) — proving the grid path is wired through the
  // move binding. (Off-center interior spot → not a bounds line.)
  const frame = page.locator("[data-frame-id]").first();
  const box = await frame.boundingBox();
  if (box === null) throw new Error("no frame box");
  const sx = box.x + 6;
  const sy = box.y + 6;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(sx + (37 * i) / 6, sy + (29 * i) / 6);
    await page.waitForTimeout(12);
  }
  await expect(page.getByTestId("snap-feedback")).toBeVisible();
  await page.mouse.up();
  await page.waitForTimeout(100);
  await expect(page.getByTestId("snap-feedback")).toHaveCount(0);

  // Toggle back off.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
