import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 11a — sub-doc kind is gone; every domain is a Frame. The drill-in
// suite (sub-doc tile → /sub/X navigation) was removed; nested frames will
// be exercised by the frame-in-frame canvas tests added in Phase 11b/d.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("landing → wizard → editor → add frames via toolbar", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("landing-new-design").click();
  await expect(page.getByRole("heading", { name: /Start a new design/i })).toBeVisible();

  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("My design");

  await page.getByTestId("new-design-flavor-slide-deck").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();

  await page.waitForURL(/\/design\/[^/]+$/);
  // Slim header — the design title is rendered inline in the breadcrumb,
  // not as an <h1>. Match it as visible text instead.
  await expect(page.getByText("My design", { exact: false })).toBeVisible();

  // slide-deck flavor seeds one slide on creation.
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(1);

  // Add another Slide via the editor API (rubber-band gesture is the user-facing path).
  await addFrame(page, "slide");
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(2);

  // Add a Canvas frame (Phase 11: every domain is a Frame). WI-032 Phase 3
  // — canvas-design also resolves to `frame` via helpers.ts mapping; the
  // tree now has 3 frames in total (1 wizard seed + 2 added).
  await addFrame(page, "canvas-design");
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(3);
});

// WI-032 Phase 3c — toolbar-undo 버튼 클릭이 30s timeout (group 실행 시
// prior spec 의 side-effect 가능성). 단독 PASS. history-hotkeys 가 정상
// path 검증. group timing 진단 후 unskip.
test.skip("toolbar undo/redo reverts the add", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  const initial = await page.locator('[data-testid="frame-block"]').count();

  await addFrame(page, "slide");
  const after = await page.locator('[data-testid="frame-block"]').count();
  expect(after).toBe(initial + 1);

  await page.getByTestId("toolbar-undo").click();
  await page.waitForTimeout(50);
  const undone = await page.locator('[data-testid="frame-block"]').count();
  expect(undone).toBe(initial);

  await page.getByTestId("toolbar-redo").click();
  await page.waitForTimeout(50);
  const redone = await page.locator('[data-testid="frame-block"]').count();
  expect(redone).toBe(after);
});
