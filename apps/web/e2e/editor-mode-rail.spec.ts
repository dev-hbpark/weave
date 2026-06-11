import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

// WI-166 P2-b / DR-114 §4 — RailPolicy drives the thumbnail rail's affordances
// per flavor. Two APPROVED behavior changes land with the policy (the only
// deliberate deviations from "zero behavior change" in P2):
//
//   ① infinite flavors (mixed / canvas-board) lose the "+" add-page button —
//     the rail is an OVERVIEW there (sections / deck toggle / focus eye), not
//     a page-lifecycle surface; frames are added on the canvas.
//   ② page-bounded flavors (slide-deck / doc-page) lose the OVERVIEW
//     affordances — non-slide section, deck toggle, focus eye — the rail is
//     the PAGE LIFECYCLE surface (add / duplicate / click-activates).
//
// The full policy tables are unit-tested in
// src/document/editor-mode/editor-mode.test.ts; these specs pin the rendered
// rail (ThumbnailPanel's "no prop → no render" slots) to the policy.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("mixed rail is an overview: no add-page '+', keeps deck toggle + focus eye (change ①)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // ① the page-lifecycle actions are absent on the infinite rail.
  await expect(page.getByTestId("thumbnail-add-page")).toHaveCount(0);
  await expect(page.locator('[data-testid^="thumbnail-duplicate-"]')).toHaveCount(0);

  // …while the overview affordances stay: deck-membership toggle + focus eye.
  await expect(page.getByTestId("thumbnail-slide-toggle-0")).toHaveCount(1);
  await expect(page.getByTestId("thumbnail-focus-0")).toHaveCount(1);

  // The non-slide (group) section still works: excluding a slide drops it
  // there — the overview rail keeps full deck-membership management.
  await page.getByTestId("thumbnail-slide-toggle-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  await expect(page.locator('[data-testid^="thumbnail-nonslide-"]').first()).toBeVisible();
});

test("slide-deck rail is the page lifecycle: add + duplicate, no toggle/eye/non-slide section (change ②)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });

  // slide-deck seeds one slide; the page-bounded rail shows its tile.
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);

  // ② the overview affordances are gone from the page-bounded rail.
  await page.getByTestId("thumbnail-0").hover(); // hover-revealed actions attach regardless
  await expect(page.locator('[data-testid^="thumbnail-slide-toggle-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="thumbnail-focus-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="thumbnail-nonslide-"]')).toHaveCount(0);

  // …while the page-lifecycle actions are present and live.
  await expect(page.locator('[data-testid^="thumbnail-duplicate-"]')).toHaveCount(1);
  await expect(page.getByTestId("thumbnail-add-page")).toBeVisible();

  // "+" appends a blank page AND activates it (clickActivatesPage rail).
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");
});

test("rail per-page delete: visible always, disabled on the last page, removes a page", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });

  // One seeded page → the delete action is present but DISABLED (a deck keeps
  // ≥ 1 page) rather than vanishing, so the affordance stays discoverable.
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  await expect(page.getByTestId("thumbnail-delete-0")).toBeVisible();
  await expect(page.getByTestId("thumbnail-delete-0")).toBeDisabled();

  // Add a second page → delete becomes enabled on both tiles.
  await page.getByTestId("thumbnail-add-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  await expect(page.getByTestId("thumbnail-delete-1")).toBeEnabled();

  // Delete the second page → back to one, and delete is disabled again.
  await page.getByTestId("thumbnail-delete-1").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(1);
  await expect(page.getByTestId("thumbnail-delete-0")).toBeDisabled();
});

// ── WI-189 — the overview rail gains the SET-SHAPED curation affordances ──
// (multi-select + the frame-attrs tile-menu rows), while the page-lifecycle
// rows stay slide-deck-only. The policy tables are unit-tested; these pin
// the rendered rail.

/** data-frame-id of every deck tile, in rail order. */
async function railFrameIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator("[data-thumbnail-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-frame-id") ?? ""));
}

test("WI-189 mixed rail multi-select: Shift range / Cmd toggle, set delete — set duplicate stays hidden", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await addFrame(page, "slide");
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

  // duplicatePage stays false in mixed: NO duplicate affordance appears even
  // with a live multi-select set (the gates are independent — WI-189/DR-125).
  await expect(page.locator('[data-testid^="thumbnail-duplicate-"]')).toHaveCount(0);

  // SET delete from a member's footer action: both frames go in one batch…
  await page.getByTestId("thumbnail-delete-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  expect(await railFrameIds(page)).toEqual([before[2], before[3]]);
  // …and ONE Cmd+Z restores the whole set (one transaction).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(4);
  expect(await railFrameIds(page)).toEqual(before);
});

test("WI-189 mixed tile menu: rename + skip-in-show rows only — no page-lifecycle rows", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // The frame-attrs rows render; the page-lifecycle rows do NOT (mixed's
  // tileMenuRows = {rename, skipInShow} — newPageAfter / editBackground are
  // meaningless on an overview rail).
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await expect(page.getByTestId("thumbnail-menu-rename-1")).toBeVisible();
  await expect(page.getByTestId("thumbnail-menu-skip-1")).toBeVisible();
  await expect(page.getByTestId("thumbnail-menu-new-1")).toHaveCount(0);
  await expect(page.getByTestId("thumbnail-menu-background-1")).toHaveCount(0);
  await expect(page.getByTestId("thumbnail-menu-duplicate-1")).toHaveCount(0);

  // ── Rename: same inline EditableText commit + one-undo contract as ⑪.
  await page.getByTestId("thumbnail-menu-rename-1").click();
  const rename = page.getByTestId("thumbnail-rename-1");
  await expect(rename).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("발표 표지");
  await page.keyboard.press("Enter");
  await expect(rename).toHaveCount(0);
  await expect(page.getByTestId("thumbnail-1")).toContainText("발표 표지");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("thumbnail-1")).not.toContainText("발표 표지");

  // ── Skip: this is the orphaned-`attrs.skipped` fix — a frame skip-marked
  // under slide-deck stays excluded from the show in EVERY flavor
  // (presentationStepIds filters flavor-independently), so the overview rail
  // must offer the unskip affordance too.
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-skip-1").click();
  await expect(page.getByTestId("thumbnail-1")).toHaveAttribute("data-skipped", "true");
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2); // still in the deck

  // The menu offers the inverse action; toggling restores the frame.
  // (600ms = step past the DR-017 ADR-D 500ms history merge window.)
  await page.waitForTimeout(600);
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await expect(page.getByTestId("thumbnail-menu-skip-1")).toContainText("프레젠테이션에 포함");
  await page.getByTestId("thumbnail-menu-skip-1").click();
  await expect(page.getByTestId("thumbnail-1")).not.toHaveAttribute("data-skipped", "true");
});
