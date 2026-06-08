// Regression: agocraft's strokeToSvgAttrs returns kebab SVG attrs
// (`stroke-width` …). Spreading them onto a React <rect>/<path> used to log
// "Invalid DOM property `stroke-width`. Did you mean `strokeWidth`?". The
// svg-stroke-props converter maps them to camelCase — this asserts no such
// console warning fires when a stroked frame renders.
import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("stroked frame renders without an 'Invalid DOM property stroke-width' warning", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/Invalid DOM property|stroke-width/.test(t)) warnings.push(t);
  });

  await prepareDesign(page, { flavor: "mixed", title: "stroke-warning" });

  // Add a frame with a stroke decoration unit (the path that builds rectStrokeProps).
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc: { root: { id: unknown } };
    };
    w.__weaveEditor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
      units: [
        { kind: "decoration.stroke", attrs: { paint: { type: "solid", color: "#e11" }, width: 4 } },
      ],
    });
  });
  await page.waitForTimeout(400);

  // The frame's stroke must be visible (proves the stroke render path ran)…
  await expect(page.locator('[data-frame-id] rect[stroke], [data-frame-id] path[stroke]').first()).toBeVisible();
  // …and no kebab-attr warning fired.
  expect(warnings, `unexpected stroke DOM warnings:\n${warnings.join("\n")}`).toEqual([]);
});
