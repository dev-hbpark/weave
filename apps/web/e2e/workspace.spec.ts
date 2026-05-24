// WI-024 Phase 19 — workspace landing page + resource library.
//
// Covers:
//   1. Saving a design and returning to / shows it in the "저장된 디자인"
//      grid; clicking the card opens the editor at /design/:id.
//   2. Uploading an image via MediaSrcDialog registers it in the resource
//      library; the workspace's "리소스" panel surfaces it.
//   3. Opening MediaSrcDialog after an upload exposes the resource
//      picker; clicking a thumbnail re-uses the prior src without a
//      fresh upload.

import { expect, test, type Page } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// 1×1 transparent PNG used for image upload paths.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function clearResources(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith("weave.resource.v1.")) {
        window.localStorage.removeItem(key);
      }
    }
  });
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
  await clearResources(page);
});

test("saved designs appear on the workspace and open on click", async ({
  page,
}) => {
  const id = await prepareDesign(page, { flavor: "mixed", title: "My A" });
  // Bounce back to /; the workspace lists the design.
  await page.goto("/");
  const card = page.locator(`[data-testid="design-card"][data-design-id="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("My A")).toBeVisible();

  // Click → editor.
  await card.click();
  await page.waitForURL(/\/design\/[^/]+$/);
  expect(page.url()).toContain(`/design/${id}`);
});

test("uploading an image registers it in the resource library", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Upload-A" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();

  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "library-tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByTestId("media-src-confirm").click();

  // Workspace lists the resource.
  await page.goto("/");
  const resCard = page
    .locator('[data-testid="resource-card"][data-resource-kind="image"]')
    .first();
  await expect(resCard).toBeVisible();
  // The thumbnail's img carries the data: URL.
  await expect(resCard.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/png;base64,/,
  );
});

test("resource picker shows prior uploads + reusing one skips re-upload", async ({
  page,
}) => {
  // First design — upload once so the library has an entry.
  await prepareDesign(page, { flavor: "mixed", title: "Setup" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "shared.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  // Second design — fresh editor. Open Add → image. The picker should
  // show the previously uploaded resource.
  await page.goto("/");
  const designId = await prepareDesign(page, { flavor: "mixed", title: "Reuse" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();

  const picker = page.getByTestId("media-src-resource-picker");
  await expect(picker).toBeVisible();
  const first = picker.getByTestId("media-src-resource").first();
  await expect(first).toBeVisible();
  // Click the existing resource → URL field gets the data: URL; uploaded
  // chip shows the original filename.
  await first.click();
  await expect(page.getByTestId("media-src-uploaded-name")).toHaveText(
    "shared.png",
  );
  // Confirm → a new image item appears using the same src.
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator(`img[src^="data:image/png;base64,"]`)).toHaveCount(1);
  // Sanity — we're on the Reuse design (no stray nav).
  expect(page.url()).toContain(`/design/${designId}`);
});

test("deleting a design from the workspace removes its card", async ({
  page,
}) => {
  const id = await prepareDesign(page, { flavor: "mixed", title: "DeleteMe" });
  await page.goto("/");
  const card = page.locator(`[data-testid="design-card"][data-design-id="${id}"]`);
  await expect(card).toBeVisible();

  // window.confirm → accept.
  page.once("dialog", (d) => d.accept());
  await card.getByTestId("design-delete").click();

  await expect(card).toHaveCount(0);
});
