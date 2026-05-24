// WI-020 Phase 8 — non-frame primitives (image / video / shape) render in
// presentation mode according to z-order, even though they aren't navigable
// camera targets.
//
// Two cases:
//   1. Primitives nested inside a slide-equivalent frame → render inside that
//      frame's scene body at their relative position.
//   2. Primitives at the design root → render in the design-layer scene at
//      absolute design coords, visible across every step.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("shape nested inside a slide is visible in present mode", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await prepareDesign(page, { flavor: "mixed", title: "P-A" });
  await addFrame(page, "slide");

  // Add a rectangle shape at root, then we'd normally nest it — but the UI
  // adds items at root. The most reliable way to set up the nested case in
  // an e2e is via the editor's exposed __weaveEditor handle, which lets us
  // exec commands directly.
  const slideId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; kind: string }>;
        };
      };
    };
    const slide = w.__weaveDoc?.root.children.find((c) => c.kind === "slide");
    return slide ? String(slide.id) : "";
  });
  expect(slideId).not.toBe("");

  // Add the shape as a child of the slide via the exposed editor.
  await page.evaluate((containerId) => {
    const w = window as unknown as {
      __weaveEditor?: {
        exec: (cmd: string, input: unknown) => unknown;
      };
    };
    w.__weaveEditor?.exec("weave.item.add", {
      kind: "shape",
      containerId,
      frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
      attrsOverride: {
        shape: "rectangle",
        fill: { type: "solid", color: "#ff0000" },
      },
    });
  }, slideId);

  // Confirm the shape was added as a slide child.
  const nested = await page.evaluate((parentId) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            kind: string;
            children: ReadonlyArray<{ id: unknown; kind: string }>;
          }>;
        };
      };
    };
    const slide = w.__weaveDoc?.root.children.find(
      (c) => String(c.id) === parentId,
    );
    return slide?.children.filter((c) => c.kind === "shape").length ?? 0;
  }, slideId);
  expect(nested).toBe(1);

  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(150);

  // The nested shape renders inside its parent frame's scene body via
  // PresentFrameTree.
  await expect(
    page.locator("[data-testid='present-primitive'][data-kind='shape']"),
  ).toHaveCount(1);
});

test("image at the design root is visible in the design-layer scene", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await prepareDesign(page, { flavor: "mixed", title: "P-B" });
  await addFrame(page, "slide");

  // Add an image at root via the Add menu.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  await page
    .getByTestId("media-src-input")
    .fill("https://example.com/bg.png");
  await page.getByTestId("media-src-confirm").click();

  // Two root children now: 1 slide + 1 image.
  await expect(page.locator("[data-frame-id]")).toHaveCount(2);

  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(150);

  // Design layer mounts because root has a non-frame primitive.
  await expect(page.getByTestId("present-design-layer")).toBeVisible();
  // The image primitive is rendered inside the design layer.
  await expect(
    page.locator(
      "[data-testid='present-design-layer'] [data-testid='present-primitive'][data-kind='image']",
    ),
  ).toHaveCount(1);
});

test("design layer is omitted when root has no non-frame primitives", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await prepareDesign(page, { flavor: "mixed", title: "P-C" });
  await addFrame(page, "slide");

  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(150);

  // Only frame scenes exist; the design layer is absent.
  await expect(page.getByTestId("present-design-layer")).toHaveCount(0);
});
