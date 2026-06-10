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
