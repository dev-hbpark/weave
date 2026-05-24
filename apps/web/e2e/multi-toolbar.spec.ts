// WI-021 — Multi-selection ContextualToolbar with mixed-value indicators.
//
// Covers:
//   1. Two shapes with the SAME fill color → toolbar shows that color, no
//      Mixed badge.
//   2. Two shapes with DIFFERENT fill colors → toolbar shows a Mixed badge
//      next to the fill color picker.
//   3. Committing a new fill color on a Mixed selection applies to both
//      shapes — values become uniform → Mixed badge disappears.
//   4. Multi-selection of mixed kinds (slide + shape) → toolbar hides.

import { expect, test, type Page } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectAll(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
}

async function addShape(
  page: Page,
  fillColor: string,
  shape: "rectangle" | "ellipse" = "rectangle",
): Promise<string> {
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined;
  });
  return await page.evaluate(
    ({ color, kind }) => {
      const w = window as unknown as {
        __weaveEditor?: {
          exec: (
            name: string,
            input: unknown,
          ) => { ok: boolean; value: unknown };
        };
        __weaveDoc?: { root: { id: unknown } };
      };
      const editor = w.__weaveEditor;
      const doc = w.__weaveDoc;
      if (editor === undefined || doc === undefined) {
        throw new Error("editor / doc not ready");
      }
      const result = editor.exec("weave.item.add", {
        kind: "shape",
        containerId: String(doc.root.id),
        frame: {
          x: Math.random() * 0.5,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          rotation: 0,
        },
        attrsOverride: {
          shape: kind,
          fill: { type: "solid", color },
        },
      });
      return String(result.value);
    },
    { color: fillColor, kind: shape },
  );
}

async function readShapeFills(
  page: Page,
  ids: ReadonlyArray<string>,
): Promise<string[]> {
  return await page.evaluate((arr) => {
    type Ch = { id: unknown; attrs: { fill?: { type?: string; color?: string } } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const ids = new Set(arr);
    const out: string[] = [];
    for (const c of w.__weaveDoc?.root.children ?? []) {
      if (!ids.has(String(c.id))) continue;
      const fill = c.attrs.fill;
      out.push(fill?.type === "solid" ? fill.color ?? "" : "");
    }
    return out;
  }, ids);
}

test("multi-select shapes with same color → toolbar mounts, no Mixed badge", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Toolbar-A" });

  const a = await addShape(page, "#ff0000");
  const b = await addShape(page, "#ff0000");
  await selectAll(page, [a, b]);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "shape");
  await expect(toolbar).toHaveAttribute("data-multi", "true");
  await expect(toolbar).toHaveAttribute("data-count", "2");
  // No mixed indicators when values are uniform.
  await expect(toolbar.getByTestId("mixed-badge")).toHaveCount(0);
});

test("multi-select shapes with different colors → Mixed badge appears", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Toolbar-B" });

  const a = await addShape(page, "#ff0000");
  const b = await addShape(page, "#00ff00");
  await selectAll(page, [a, b]);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  // Fill color diverges → Mixed badge in the Fill section.
  await expect(
    toolbar.getByTestId("mixed-badge").first(),
  ).toBeVisible();
});

test("setting fill on a Mixed selection applies to all → Mixed clears", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Toolbar-C" });

  const a = await addShape(page, "#ff0000");
  const b = await addShape(page, "#00ff00");
  await selectAll(page, [a, b]);

  // Drive the multi-shape update directly via the editor — simulates the
  // user picking a color in the ColorPicker (the underlying onValueCommit
  // path is what the toolbar wires up). This avoids the visual-only
  // ColorPicker DOM dance.
  await page.evaluate((ids) => {
    const w = window as unknown as {
      __weaveEditor?: {
        exec: (name: string, input: unknown) => unknown;
      };
    };
    for (const id of ids) {
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: {
            ...prev.attrs,
            fill: { type: "solid", color: "#0000ff" },
          } as unknown as Readonly<Record<string, unknown>>,
        }),
      });
    }
  }, [a, b]);

  // Doc state — both shapes now share #0000ff.
  const fills = await readShapeFills(page, [a, b]);
  expect(fills).toEqual(["#0000ff", "#0000ff"]);

  // UI — Mixed badge gone because both fill colors are now uniform.
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar.getByTestId("mixed-badge")).toHaveCount(0);
});

test("mixed kinds (slide + shape) → toolbar hides", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Toolbar-D" });

  // Add one shape and one slide.
  const shapeId = await addShape(page, "#ff0000");
  const slideId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: {
        exec: (
          name: string,
          input: unknown,
        ) => { ok: boolean; value: unknown };
      };
      __weaveDoc?: { root: { id: unknown } };
    };
    const result = w.__weaveEditor!.exec("weave.item.add", {
      kind: "slide",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.55, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
    });
    return String(result.value);
  });

  await selectAll(page, [shapeId, slideId]);
  // Mixed kinds → bar must not mount.
  await expect(page.getByTestId("contextual-toolbar")).toHaveCount(0);
});
