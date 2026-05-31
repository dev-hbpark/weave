// WI-020 Phase 6 — Add menu e2e.
//
// Verifies that the "+" button in the editor header opens a DropdownMenu
// with image / video / shape sub-kind options, and that selecting any of
// them adds a corresponding item to the design and auto-selects it (so the
// ContextualToolbar mounts with the right kind).

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("'+' button opens add menu with image / video / shape options", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-A" });
  const addBtn = page.getByTestId("toolbar-add");
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.getByTestId("add-image")).toBeVisible();
  await expect(page.getByTestId("add-video")).toBeVisible();
  // Shapes are grouped under a single "도형" submenu — its types reveal on open.
  await expect(page.getByTestId("add-shape")).toBeVisible();
  await page.getByTestId("add-shape").click();
  await expect(page.getByTestId("add-shape-rectangle")).toBeVisible();
  await expect(page.getByTestId("add-shape-star")).toBeVisible();
});

test("Add image → URL dialog opens, confirm creates frame + ContextualToolbar appears", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-B" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();
  // Image add now goes through MediaSrcDialog — fill URL + confirm.
  await page.getByTestId("media-src-input").fill("https://example.com/x.jpg");
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "image");
});

test("Add shape:star → toolbar shows shape kind", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-C" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-star").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "shape");
});

test("Add video → URL dialog opens, confirm creates video + toolbar mounts", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-D" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-video").click();
  await page.getByTestId("media-src-input").fill("https://example.com/x.mp4");
  await page.getByTestId("media-src-confirm").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible({ timeout: 3000 });
  await expect(toolbar).toHaveAttribute("data-kind", "video");
});

async function lastShapeSubAttrs(
  page: import("@playwright/test").Page,
): Promise<Record<string, unknown> | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: { kind: string; attrs: { subAttrs?: unknown } }[] } };
    };
    const shapes = (w.__weaveDoc?.root.children ?? []).filter((c) => c.kind === "shape");
    const s = shapes[shapes.length - 1];
    return (s?.attrs.subAttrs as Record<string, unknown>) ?? null;
  });
}

// DR-025 / WI-062 — `line` is its own kind; its attrs (points/smooth/heads) live
// directly on `attrs` (no subAttrs).
async function lastLineAttrs(
  page: import("@playwright/test").Page,
): Promise<Record<string, unknown> | null> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: { kind: string; attrs: Record<string, unknown> }[] } };
    };
    const lines = (w.__weaveDoc?.root.children ?? []).filter((c) => c.kind === "line");
    return lines[lines.length - 1]?.attrs ?? null;
  });
}

// The freeform-polygon (`poly`) sub-kind is reachable from the type-change
// dropdown, so the add menu's 도형 submenu must offer it too (자유 다각형).
test("Add 도형 → 자유 다각형 creates a closed poly shape", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-Poly" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-poly").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const attrs = await lastShapeSubAttrs(page);
  expect(attrs?.shape).toBe("poly");
  expect(attrs?.closed).toBe(true);
});

// 선 is its own KIND (DR-025), separate from 도형: 직선 + 자유선.
test("Add 선 category → 직선 / 자유선 create `line` kind items", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-Line" });

  // 직선 → a 2-point `line` (straight).
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("add-line-straight")).toBeVisible();
  await expect(page.getByTestId("add-line-free")).toBeVisible();
  await page.getByTestId("add-line-straight").click();
  {
    const a = await lastLineAttrs(page);
    expect(a).not.toBeNull();
    expect((a?.points as unknown[]).length).toBe(2);
    expect(a?.smooth).not.toBe(true);
  }

  // 자유선 → a multi-point `line` (open polyline render).
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await page.getByTestId("add-line-free").click();
  const free = await lastLineAttrs(page);
  expect((free?.points as unknown[]).length).toBeGreaterThan(2);
  expect(await page.locator("svg polyline").count()).toBeGreaterThanOrEqual(1);
});

// 곡선 / 자유곡선 — smooth `line` items (Catmull-Rom curve → stroked <path>).
test("Add 선 category → 곡선 / 자유곡선 create smooth `line` kind items", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Add-Curve" });

  // 곡선 → smooth line (3 control points).
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("add-line-curve")).toBeVisible();
  await expect(page.getByTestId("add-line-curve-free")).toBeVisible();
  await page.getByTestId("add-line-curve").click();
  const curve = await lastLineAttrs(page);
  expect(curve?.smooth).toBe(true);

  // Rendered as a cubic-bezier <path> with fill:none + a stroke (a curve, not a face).
  const paint = await page
    .locator("[data-frame-id] svg path")
    .last()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fill: cs.fill, stroke: cs.stroke, hasCubic: (el.getAttribute("d") ?? "").includes("C") };
    });
  expect(paint.hasCubic).toBe(true);
  expect(paint.fill).toBe("none");
  expect(paint.stroke).not.toBe("none");

  // 자유곡선 → smooth line with more control points.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await page.getByTestId("add-line-curve-free").click();
  const freeCurve = await lastLineAttrs(page);
  expect(freeCurve?.smooth).toBe(true);
  expect((freeCurve?.points as unknown[]).length).toBeGreaterThan(3);
});
