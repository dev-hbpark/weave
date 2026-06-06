// Corner-radius model — browser proof that the radius renders CIRCULAR
// (rx === ry on both axes) and clamps to half the SHORT side, on a NON-SQUARE
// frame. The previous model rendered `rx = r·0.5·w`, `ry = r·0.5·h`, i.e. an
// ELLIPSE whenever w ≠ h — this spec is the regression gate for that fix.

import { expect, test } from "@playwright/test";
import { nn } from "../src/lib/nn.js";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers";

/** Read the frame's main fill rect (the rounded one — the clip rect lives in
 *  <defs>, so a direct `svg > rect` child is the visible one). */
async function readFrameRect(page: import("@playwright/test").Page) {
  const rect = page.locator('[data-testid="frame-block"] svg > rect').first();
  await expect(rect).toBeVisible();
  return rect.evaluate((el) => ({
    rx: Number.parseFloat(el.getAttribute("rx") ?? "0"),
    ry: Number.parseFloat(el.getAttribute("ry") ?? "0"),
    w: Number.parseFloat(el.getAttribute("width") ?? "0"),
    h: Number.parseFloat(el.getAttribute("height") ?? "0"),
  }));
}

async function setFrameRadius(
  page: import("@playwright/test").Page,
  frameId: string,
  cornerRadius: number,
) {
  await page.evaluate(
    ({ id, cornerRadius }) => {
      const editor = (
        window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => unknown } }
      ).__weaveEditor;
      // A solid fill makes FrameBlock mount its SVG overlay (a paint-less frame
      // stays a plain transparent div with no rect to inspect).
      editor.exec("weave.item.setDecoration", {
        itemId: id,
        kind: "decoration.fill",
        attrs: { type: "solid", color: "#3366ff" },
      });
      editor.exec("weave.item.update", {
        itemId: id,
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, cornerRadius },
        }),
      });
    },
    { id: frameId, cornerRadius },
  );
}

test.describe("corner radius — circular px model", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllDesigns(page);
  });

  test("non-square frame: rx === ry, and a large radius clamps to half-short", async ({ page }) => {
    await prepareDesign(page);
    // 0.5 × 0.1 of a 1920×1080 design → 960 × 108 abs box (decidedly non-square).
    await addFrame(page, "frame", {
      frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.1, rotation: 0 },
    });
    const frameId = await page.evaluate(() => {
      const root = (
        window as unknown as { __weaveDoc: { root: { id: unknown; children: { id: unknown }[] } } }
      ).__weaveDoc.root;
      return String(nn(root.children[root.children.length - 1]).id);
    });

    // Oversized radius → must clamp to half the short side, circular.
    await setFrameRadius(page, frameId, 9999);
    await expect
      .poll(async () => {
        const r = await readFrameRect(page);
        // rx === ry (circular) AND rx === min(w,h)/2 (half-short clamp).
        const circular = Math.abs(r.rx - r.ry) < 0.5;
        const clamped = Math.abs(r.rx - Math.min(r.w, r.h) / 2) < 0.75;
        return circular && clamped && r.rx > 1;
      })
      .toBe(true);

    // Moderate radius (27 design-px = half of the 54px half-short) → circular
    // and NOT clamped (strictly less than half-short).
    await setFrameRadius(page, frameId, 27);
    await expect
      .poll(async () => {
        const r = await readFrameRect(page);
        const circular = Math.abs(r.rx - r.ry) < 0.5;
        const notClamped = r.rx < Math.min(r.w, r.h) / 2 - 0.5 && r.rx > 1;
        return circular && notClamped;
      })
      .toBe(true);
  });
});
