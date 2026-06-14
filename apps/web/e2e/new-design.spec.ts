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
  // slide-deck (Presentation) is now a coming-soon flavor — disabled for real
  // users. This spec exercises the page-bounded engine, so it sets the DEV
  // unlock key (mirrors prepareDesign) before opening the wizard.
  await page.evaluate(() => {
    window.localStorage.setItem("weave.dev.unlock-flavors", "1");
  });

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

  // WI-153 P2.1 — slide-deck is page-bounded: the canvas renders ONE page
  // (the active one) at a time, so adding top-level frames grows the
  // thumbnail rail, not the on-canvas frame count.
  await addFrame(page, "slide");
  await expect(page.locator('[data-testid="thumbnail-1"]')).toBeVisible();
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(1);

  // Add a Canvas frame (Phase 11: every domain is a Frame). WI-032 Phase 3
  // — canvas-design also resolves to `frame` via helpers.ts mapping; the
  // tree now has 3 top-level frames = 3 rail pages (1 wizard seed + 2 added).
  await addFrame(page, "canvas-design");
  await expect(page.locator('[data-testid="thumbnail-2"]')).toBeVisible();
  await expect(page.locator('[data-testid="frame-block"]')).toHaveCount(1);
});

// WI-165 — only mixed is product-ready; slide-deck (Presentation),
// canvas-board and doc-page tiles render disabled ("Coming soon") until their
// surfaces ship. Driven by FLAVOR_REGISTRY.availability, not a hardcoded list.
// The DEV unlock key (`weave.dev.unlock-flavors`, set by prepareDesign for
// specs that exercise those engines) re-enables them — this test does NOT set
// it, so it sees what a real user sees.
test("wizard disables coming-soon flavors (WI-165)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();
  await expect(page.getByRole("heading", { name: /Start a new design/i })).toBeVisible();

  await expect(page.getByTestId("new-design-flavor-mixed")).toBeEnabled();
  await expect(page.getByTestId("new-design-flavor-slide-deck")).toBeDisabled();
  await expect(page.getByTestId("new-design-flavor-canvas-board")).toBeDisabled();
  await expect(page.getByTestId("new-design-flavor-doc-page")).toBeDisabled();
  await expect(page.getByTestId("new-design-flavor-slide-deck")).toContainText("Coming soon");
  await expect(page.getByTestId("new-design-flavor-canvas-board")).toContainText("Coming soon");
  await expect(page.getByTestId("new-design-flavor-doc-page")).toContainText("Coming soon");

  // The remaining enabled flavor still selects normally.
  await page.getByTestId("new-design-flavor-mixed").click();
  await expect(page.getByTestId("new-design-flavor-mixed")).toHaveAttribute("data-state", "checked");
});

// WI-155 — rail per-page duplicate. `weave.page.duplicate` clones the page
// in place (kit offset 0, no nudge) AND inserts the clone right after the
// source in presentationOrder, in ONE transaction — so a single keyboard
// Cmd+Z reverts both (Document mutation rule). Keyboard undo is used, not
// the toolbar-undo button — that click path is the group-timing-flaky one
// test.skip'd below; history-hotkeys is the proven pattern.
test("rail page duplicate clones in place; one Cmd+Z reverts (WI-155)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });

  // slide-deck seeds one slide; the page-bounded rail shows its tile.
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  const sourceId = await page.getByTestId("thumbnail-0").getAttribute("data-thumbnail-id");
  expect(sourceId).not.toBeNull();

  // The footer action is hover-revealed (opacity), but always in the DOM —
  // hover the tile so the click lands on a visible control.
  await page.getByTestId("thumbnail-0").hover();
  await page.getByTestId("thumbnail-duplicate-0").click();

  // Clone lands right AFTER the source with a fresh id, and becomes the
  // active page (mirrors onAddPage).
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  const cloneId = await page.getByTestId("thumbnail-1").getAttribute("data-thumbnail-id");
  expect(cloneId).not.toBeNull();
  expect(cloneId).not.toBe(sourceId);
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");

  // ONE keyboard undo removes the clone AND its presentationOrder entry.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  expect(await page.getByTestId("thumbnail-0").getAttribute("data-thumbnail-id")).toBe(sourceId);

  // Cmd+Shift+Z re-applies the same transaction — clone returns at index 1.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  expect(await page.getByTestId("thumbnail-1").getAttribute("data-thumbnail-id")).toBe(cloneId);
});

// WI-155 — the duplicate action is scoped to page-bounded formats (WI-153
// 결정 6): infinite-canvas formats keep the canvas-side duplicate (0.02
// nudge) and must render NO rail duplicate button.
test("mixed (infinite canvas) rail has no page-duplicate action (WI-155)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await page.getByTestId("thumbnail-0").hover();
  await expect(page.locator('[data-testid^="thumbnail-duplicate-"]')).toHaveCount(0);
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
