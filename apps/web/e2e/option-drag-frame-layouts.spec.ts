// WI-046 — Option(⌥)+drag on the empty design canvas opens a popover that
// offers exactly THREE frame layout paradigms (프레임 / 플렉스 / 그리드) and
// no separate layout toggle. Picking one creates a frame with that layout.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function stageBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const stage = page.locator('[data-testid="frame-stage"]');
  const box = await stage.boundingBox();
  if (box === null) throw new Error("no frame-stage");
  return box;
}

async function altDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
}

async function rootChildCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
    };
    return w.__weaveDoc?.root.children?.length ?? 0;
  });
}

test("WI-046 — Option+drag popover offers exactly 프레임 / 플렉스 / 그리드, no toggle", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-046-three" });
  const s = await stageBox(page);
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  await altDrag(page, { x: cx - 150, y: cy - 90 }, { x: cx + 150, y: cy + 90 });

  const list = page.locator('[data-testid="rubber-band-popover-list"]');
  await expect(list).toBeVisible({ timeout: 5_000 });

  // Exactly three options, and the old Absolute/Flex/Grid toggle is gone.
  await expect(list.locator('[role="option"]')).toHaveCount(3);
  await expect(page.getByTestId("rubber-band-popover-item-frame-absolute")).toHaveText(/프레임/);
  await expect(page.getByTestId("rubber-band-popover-item-frame-flex")).toHaveText(/플렉스/);
  await expect(page.getByTestId("rubber-band-popover-item-frame-grid")).toHaveText(/그리드/);
  await expect(page.getByTestId("rubber-band-popover-layout-toggle")).toHaveCount(0);
});

test("WI-046 — picking 그리드 creates a frame with an auto-grid layout", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-046-grid" });
  const s = await stageBox(page);
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;

  const before = await rootChildCount(page);
  await altDrag(page, { x: cx - 150, y: cy - 90 }, { x: cx + 150, y: cy + 90 });

  await page.getByTestId("rubber-band-popover-item-frame-grid").click();

  await expect.poll(() => rootChildCount(page)).toBe(before + 1);
  const layoutKind = await page.evaluate(() => {
    type Ch = { kind: string; attrs?: { layout?: { kind?: string } } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return { kind: last?.kind, layout: last?.attrs?.layout?.kind };
  });
  expect(layoutKind.kind).toBe("frame");
  expect(layoutKind.layout).toBe("auto-grid");
});
