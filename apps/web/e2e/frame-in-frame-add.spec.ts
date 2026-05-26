// WI-034 — frame 안의 빈 영역에서 Alt+drag → 그 frame 의 child 로
// 새 item 추가. 이전(WI-033 P2 직후)에는 RubberBandLayer 의
// `emptyRegionAccept` 가 frame 위 drag 를 reject 하고 FrameMoveBinding
// 이 우선이라, frame 안 add 의 UI path 가 0이었다. WI-034 가
// (a) acceptTarget 에서 `[data-frame-id]` reject 제거,
// (b) FrameMoveBinding modifiers 에 `alt: "forbidden"` 추가,
// (c) adapter 의 hit-test 로 drop 위치의 deepest frame 을
//     containerId 로 사용 — 의 세 변경으로 path 활성.

import { expect, test, type Page } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function setupParent(page: Page): Promise<string> {
  await prepareDesign(page, { flavor: "mixed", title: "WI-034-parent" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  expect(parentId.length).toBeGreaterThan(0);
  return parentId;
}

async function childCountOf(page: Page, parentId: string): Promise<number> {
  return await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{ id: unknown }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    return parent?.children?.length ?? 0;
  }, parentId);
}

test("Alt+drag inside a parent frame adds the new item as that parent's child (not root)", async ({
  page,
}) => {
  const parentId = await setupParent(page);
  // Parent's design rect = (0.1*1920, 0.1*1080) - (0.6*1920, 0.6*1080)
  // = (192, 108) - (1152, 648). Drag a small box inside that area.
  const rect = await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, parentId);
  expect(rect).not.toBeNull();
  if (rect === null) return;

  const startX = rect.left + rect.width * 0.3;
  const startY = rect.top + rect.height * 0.3;
  const endX = rect.left + rect.width * 0.6;
  const endY = rect.top + rect.height * 0.6;

  const beforeCount = await childCountOf(page, parentId);

  await page.keyboard.down("Alt");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  // The RubberBand 's recommendation popover opens on release. Pick the
  // first recommendation to commit the add.
  const recommendation = page
    .locator('[data-testid^="rubber-band-popover-item-"]')
    .first();
  await expect(recommendation).toBeVisible({ timeout: 5_000 });
  await recommendation.click();

  await expect.poll(() => childCountOf(page, parentId)).toBe(beforeCount + 1);
});
