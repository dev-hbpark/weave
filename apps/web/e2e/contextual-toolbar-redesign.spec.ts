// DR-design-021 — ContextualToolbar redesign: Combobox (Select) for enum
// selection, Accordion progressive disclosure in the More popover, and a
// GridSizePicker drag-matrix for grid row/column counts.
//
// These tests drive the real controls (not programmatic doc mutation) so the
// UI → command wiring is verified end-to-end.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectViaVm(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
  await page.waitForTimeout(50);
}

async function lastFrameId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
}

async function frameLayout(
  page: Page,
  id: string,
): Promise<{ kind?: string; cols?: number; rows?: number } | null> {
  return page.evaluate((fid) => {
    type Ch = {
      id: unknown;
      attrs?: {
        layout?: { kind?: string; columns?: unknown[]; rows?: unknown[] };
      };
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
    const l = it?.attrs?.layout;
    if (l === undefined) return { kind: undefined };
    return { kind: l.kind, cols: l.columns?.length, rows: l.rows?.length };
  }, id);
}

async function setLayoutProgrammatically(
  page: Page,
  id: string,
  layout: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ fid, lay }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.frame.setLayout", { itemId: fid, layout: lay });
    },
    { fid: id, lay: layout },
  );
  await page.waitForTimeout(80);
}

test("DR-021 — frame layout Combobox switches the paradigm (absolute → flex)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "DR021-combobox" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.4, rotation: 0 },
  });
  const id = await lastFrameId(page);
  await selectViaVm(page, id);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "frame");

  // Open the layout combobox and pick Flex.
  await page.getByTestId("frame-layout-select").click();
  await page.getByTestId("frame-layout-select-option-auto-flex").click();

  await expect.poll(async () => (await frameLayout(page, id)).kind).toBe("auto-flex");
});

test("DR-021 — grid size picker matrix sets column × row counts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "DR021-grid" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.5, rotation: 0 },
  });
  const id = await lastFrameId(page);
  // Start from a 1×1 grid so the matrix has something to grow.
  await setLayoutProgrammatically(page, id, {
    kind: "auto-grid",
    columns: [{ kind: "fr", value: 1 }],
    rows: [{ kind: "fr", value: 1 }],
    columnGap: 0,
    rowGap: 0,
    justify: "stretch",
    align: "stretch",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await selectViaVm(page, id);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "frame");

  // Open More — the "격자" group is open by default, so the matrix shows.
  await page.getByTestId("toolbar-more-trigger").click();
  const picker = page.getByTestId("grid-size-picker");
  await expect(picker).toBeVisible();

  // Click the cell at column 3, row 2 → grid becomes 3×2.
  await page.getByTestId("grid-size-picker-cell-3-2").click();

  await expect.poll(async () => (await frameLayout(page, id)).cols).toBe(3);
  expect((await frameLayout(page, id)).rows).toBe(2);
});

test("DR-021 — text More popover groups fields into accordions (정렬 collapsed until expanded)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "DR021-accordion" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "text");

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await expect(popover).toBeVisible();

  // 타이포 group is open by default → its content (Family) is visible.
  await expect(popover.getByTestId("text-typo-group-content")).toBeVisible();
  await expect(popover.locator('[role="group"][aria-label="Family"]')).toBeVisible();

  // 정렬 group is collapsed by default → its content is not rendered.
  await expect(popover.getByTestId("text-align-group-content")).toHaveCount(0);

  // Expand it → the 2D alignment pad appears.
  await popover.getByTestId("text-align-group-trigger").click();
  await expect(popover.getByTestId("text-align-group-content")).toBeVisible();
  await expect(popover.getByTestId("text-align-pad")).toBeVisible();
});

test("DR-021 — AlignmentPad sets text align × valign in one control", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "DR021-text-pad" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
  expect(id).not.toBe("");

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  await popover.getByTestId("text-align-group-trigger").click();
  // Cell col=1 (center), row=2 (bottom) → textAlign center, valign BOTTOM.
  await popover.getByTestId("text-align-pad-cell-1-2").click();

  const attrs = await page.evaluate((tid) => {
    type Ch = { id: unknown; attrs?: { textAlign?: string; textAlignVertical?: string } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === tid);
    return { align: it?.attrs?.textAlign, valign: it?.attrs?.textAlignVertical };
  }, id);
  expect(attrs.align).toBe("center");
  expect(attrs.valign).toBe("BOTTOM");
});

test("DR-021 — flex AlignmentPad sets justify × align in one patch", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "DR021-flex-pad" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.5, rotation: 0 },
  });
  const id = await lastFrameId(page);
  await setLayoutProgrammatically(page, id, {
    kind: "auto-flex",
    direction: "row",
    gap: 0,
    justify: "start",
    align: "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await selectViaVm(page, id);

  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
  await page.getByTestId("toolbar-more-trigger").click();
  // The flex "레이아웃" group is open by default → the pad is visible.
  const pad = page.getByTestId("flex-align-pad");
  await expect(pad).toBeVisible();
  // Cell col=2 (end), row=1 (center) → justify end, align center.
  await page.getByTestId("flex-align-pad-cell-2-1").click();

  const got = await page.evaluate((fid) => {
    type Ch = { id: unknown; attrs?: { layout?: { justify?: string; align?: string } } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
    return { justify: it?.attrs?.layout?.justify, align: it?.attrs?.layout?.align };
  }, id);
  expect(got.justify).toBe("end");
  expect(got.align).toBe("center");
});
