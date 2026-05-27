// WI-020 Phase 6 — Figma-style image/video fill for shapes.
//
// Covers:
//   1. Select a shape → toolbar's Fill section shows image/video fill buttons.
//   2. Click 이미지 fill button → MediaSrcDialog opens (empty initial).
//   3. Confirm URL → shape's attrs.fill becomes type:"image" with that src.
//      The SVG `<pattern>` def referencing the image is rendered.
//   4. Same for 비디오 — confirm renders a `<foreignObject>` + `<video>`.
//   5. Click × clear → fill returns to solid color, color swatch is visible
//      again, image/video fill buttons return.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function getSelectedShapeFill(
  page: import("@playwright/test").Page,
): Promise<Readonly<Record<string, unknown>> | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string; attrs: Readonly<Record<string, unknown>> }> } };
    };
    const items = w.__weaveDoc?.root.children ?? [];
    const shape = items.find((c) => c.kind === "shape");
    if (!shape) return null;
    return (shape.attrs.fill as Readonly<Record<string, unknown>>) ?? null;
  });
}

test("Shape → 이미지 채우기 sets fill to type:image with src", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Fill-A" });

  // Add a rectangle shape.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape-rectangle").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  // Toolbar should mount with shape kind.
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "shape");

  // DR-design-015 — image-fill button lives inside More popover (Fill
  // field). Open More first.
  await page.getByTestId("toolbar-more-trigger").click();
  await page.getByTestId("shape-fill-image").click();
  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-kind", "image");
  await expect(page.getByTestId("media-src-input")).toHaveValue("");

  const url = "https://example.com/fill.jpg";
  await page.getByTestId("media-src-input").fill(url);
  await page.getByTestId("media-src-confirm").click();
  await expect(dialog).toHaveCount(0);

  // Doc state: shape.attrs.fill = { type: "image", src, ... }.
  const fill = await getSelectedShapeFill(page);
  expect(fill).not.toBeNull();
  expect(fill?.type).toBe("image");
  expect(fill?.src).toBe(url);

  // SVG renderer: <pattern><image href> inside <defs>. The element is
  // technically "hidden" (defs aren't rendered themselves), so assert
  // attachment rather than visibility.
  await expect(page.locator(`image[href="${url}"]`)).toHaveCount(1);
});

test("Shape → 비디오 채우기 sets fill to type:video and renders <video>", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Fill-B" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape-ellipse").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });

  // DR-design-015 — video-fill lives inside More popover.
  await page.getByTestId("toolbar-more-trigger").click();
  await page.getByTestId("shape-fill-video").click();
  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-kind", "video");

  const url = "https://example.com/fill.mp4";
  await page.getByTestId("media-src-input").fill(url);
  await page.getByTestId("media-src-confirm").click();
  await expect(dialog).toHaveCount(0);

  const fill = await getSelectedShapeFill(page);
  expect(fill).not.toBeNull();
  expect(fill?.type).toBe("video");
  expect(fill?.src).toBe(url);
  expect(fill?.muted).toBe(true);
  expect(fill?.loop).toBe(true);

  // <video> element inside the shape's foreignObject.
  await expect(page.locator(`video[src="${url}"]`)).toHaveCount(1);
});

test("Shape → × clear returns fill to solid color and restores fill buttons", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Fill-C" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape-rectangle").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  // DR-design-015 — open More, apply image fill, verify clear works.
  await page.getByTestId("toolbar-more-trigger").click();
  await page.getByTestId("shape-fill-image").click();
  await page.getByTestId("media-src-input").fill("https://example.com/x.jpg");
  await page.getByTestId("media-src-confirm").click();

  // Dialog confirm dismissed the More popover via outside-pointer. Re-open
  // to find the clear button.
  await page.getByTestId("toolbar-more-trigger").click();
  const clear = page.getByTestId("shape-fill-clear");
  await expect(clear).toBeVisible();
  await clear.click();

  // After clear, the fill is solid again. The popover stays open (the
  // click landed on a child inside it, not the trigger) and the Fill field
  // re-renders the solid branch → image/video swap buttons appear in-place.
  const fill = await getSelectedShapeFill(page);
  expect(fill?.type).toBe("solid");
  await expect(page.getByTestId("shape-fill-image")).toBeVisible();
  await expect(page.getByTestId("shape-fill-video")).toBeVisible();
});
