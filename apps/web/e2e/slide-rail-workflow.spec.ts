import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-184 — Batch 2: slide-unit keyboard workflow on the page-bounded rail
// (SLIDE_DECK_INTERACTION_SPEC §4 items ⑦–⑪). These specs pin the rendered
// behavior; the pure pieces (presentation-order splice, policy tables) are
// unit-tested next to their modules.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** data-frame-id of every deck tile, in rail order. */
async function railFrameIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator("[data-thumbnail-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-frame-id") ?? ""));
}

test("⑩ '+' inserts the new page right AFTER the current one (not at the deck end)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();

  // Grow the deck to 3 pages (each '+' lands after the then-active page, so
  // sequential clicks still build P1,P2,P3 in order).
  await page.getByTestId("thumbnail-add-page").click();
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);
  const before = await railFrameIds(page);

  // Activate page 1 (index 0), then add: the new page must land at index 1 —
  // between P1 and the former P2 — and become the active page.
  await page.getByTestId("thumbnail-activate-0").click();
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(4);

  const after = await railFrameIds(page);
  expect(after[0]).toBe(before[0]);
  // the new id sits at index 1…
  expect(before).not.toContain(after[1]);
  // …and the former P2/P3 shifted right, unchanged in relative order.
  expect(after[2]).toBe(before[1]);
  expect(after[3]).toBe(before[2]);
  // rail parity: the new page is the ACTIVE page.
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");

  // One Cmd+Z rolls back create + order splice together (one transaction).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);
  expect(await railFrameIds(page)).toEqual(before);
});

test("⑦ rail focus model: arrow keys on a tile step the active slide and move DOM focus", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await page.getByTestId("thumbnail-add-page").click();
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);

  // Clicking a tile gives its activation button DOM focus — rail focus.
  await page.getByTestId("thumbnail-activate-0").click();
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("thumbnail-activate-0")).toBeFocused();

  // → / ↓ step forward; activation AND focus walk together (filmstrip
  // semantics: moving rail focus IS changing the current slide).
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("thumbnail-activate-1")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("thumbnail-activate-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("thumbnail-activate-2")).toBeFocused();
  // Clamped at the last slide (no wrap).
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("thumbnail-activate-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("thumbnail-activate-2")).toBeFocused();

  // ← / ↑ step back; clamped at the first slide.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("thumbnail-activate-0")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
});

test("⑨ rail multi-select: Shift range / Cmd toggle, set duplicate (one undo) and set delete", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await page.getByTestId("thumbnail-add-page").click();
  await page.getByTestId("thumbnail-add-page").click();
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(4);
  const before = await railFrameIds(page);

  // Shift+click ranges from the plain-clicked anchor: tiles 0..1 selected.
  await page.getByTestId("thumbnail-activate-0").click();
  await page.getByTestId("thumbnail-activate-1").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-multiselected]")).toHaveCount(2);

  // Cmd+click toggles membership without disturbing the rest of the set.
  await page.getByTestId("thumbnail-activate-2").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator("[data-multiselected]")).toHaveCount(3);
  await page.getByTestId("thumbnail-activate-2").click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator("[data-multiselected]")).toHaveCount(2);

  // SET duplicate from any member's footer action: each clone lands right
  // after its own source (P1,C1,P2,C2,P3,P4) — and it is ONE transaction.
  await page.getByTestId("thumbnail-duplicate-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(6);
  const dup = await railFrameIds(page);
  expect(dup[0]).toBe(before[0]);
  expect(before).not.toContain(dup[1]); // clone of P1
  expect(dup[2]).toBe(before[1]);
  expect(before).not.toContain(dup[3]); // clone of P2
  expect(dup[4]).toBe(before[2]);
  expect(dup[5]).toBe(before[3]);
  // the LAST clone becomes the active page (mirrors single duplicate).
  await expect(page.getByTestId("thumbnail-activate-3")).toHaveAttribute("aria-pressed", "true");
  // One Cmd+Z rolls the WHOLE set back (clones + order in one undo step).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(4);
  expect(await railFrameIds(page)).toEqual(before);

  // SET delete: select tiles 0..1 again, delete from a member's footer —
  // both pages go in one batch and the active page lands on the survivor.
  await page.getByTestId("thumbnail-activate-0").click();
  await page.getByTestId("thumbnail-activate-1").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-multiselected]")).toHaveCount(2);
  await page.getByTestId("thumbnail-delete-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  expect(await railFrameIds(page)).toEqual([before[2], before[3]]);
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
});

test("⑪ rail right-click: inline rename + skip-in-show (PPT Hide Slide), both undoable", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // ── Rename: right-click → 이름 바꾸기 → inline EditableText in the footer.
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-rename-1").click();
  const rename = page.getByTestId("thumbnail-rename-1");
  await expect(rename).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("발표 표지");
  await page.keyboard.press("Enter");
  // Field is gone, the committed title renders, and ONE undo reverts it.
  await expect(rename).toHaveCount(0);
  await expect(page.getByTestId("thumbnail-1")).toContainText("발표 표지");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("thumbnail-1")).not.toContainText("발표 표지");

  // ── Skip: right-click → 프레젠테이션에서 건너뛰기 → tile stays in the rail,
  // marked skipped (the show's step list is unit-tested at presentationStepIds).
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-skip-1").click();
  await expect(page.getByTestId("thumbnail-1")).toHaveAttribute("data-skipped", "true");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2); // still in the deck

  // Re-opening the menu offers the inverse action; toggling restores the slide.
  // (Step past the 500ms history merge window first — DR-017 ADR-D folds
  // consecutive item.attrs patches on the same item into one undo entry, and
  // this test clicks faster than any human would.)
  await page.waitForTimeout(600);
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await expect(page.getByTestId("thumbnail-menu-skip-1")).toContainText("프레젠테이션에 포함");
  await page.getByTestId("thumbnail-menu-skip-1").click();
  await expect(page.getByTestId("thumbnail-1")).not.toHaveAttribute("data-skipped", "true");

  // History contract: each toggle was one transaction.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("thumbnail-1")).toHaveAttribute("data-skipped", "true");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("thumbnail-1")).not.toHaveAttribute("data-skipped", "true");
});

test("⑧ PageUp/PageDown step the active slide from canvas focus (clamped at the deck ends)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await page.getByTestId("thumbnail-add-page").click();
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);

  // Land on page 1, focus the canvas (not the rail).
  await page.getByTestId("thumbnail-activate-0").click();
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
  // (y > 48 — the fixed header intercepts clicks in the top 48px band.)
  await page.locator("main").click({ position: { x: 8, y: 200 } });

  await page.keyboard.press("PageDown");
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("PageDown");
  await expect(page.getByTestId("thumbnail-activate-2")).toHaveAttribute("aria-pressed", "true");
  // Clamped at the last slide (no wrap — office behavior).
  await page.keyboard.press("PageDown");
  await expect(page.getByTestId("thumbnail-activate-2")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("PageUp");
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("PageUp");
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
  // Clamped at the first slide.
  await page.keyboard.press("PageUp");
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
});
