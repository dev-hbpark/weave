// WI-133 — drives the REAL new toolbar controls (not programmatic mutation):
// flex wrap + align-content, grid auto-flow + dense. Confirms the UI → command
// wiring stores the new spec fields.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectViaVm(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { set: (x: unknown) => void } } };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
  await page.waitForTimeout(60);
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

async function setLayout(page: Page, id: string, layout: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ fid, lay }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.frame.setLayout", { itemId: fid, layout: lay });
    },
    { fid: id, lay: layout },
  );
  await page.waitForTimeout(100);
}

async function layoutField(page: Page, id: string, field: string): Promise<unknown> {
  return page.evaluate(
    ({ fid, f }) => {
      type Ch = { id: unknown; attrs?: { layout?: Record<string, unknown> } };
      const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
      const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
      return it?.attrs?.layout?.[f];
    },
    { fid: id, f: field },
  );
}

const FLEX = {
  kind: "auto-flex",
  direction: "row",
  gap: 0,
  justify: "start",
  align: "start",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};
const GRID = {
  kind: "auto-grid",
  columns: [{ kind: "fr", value: 1 }],
  rows: [{ kind: "fr", value: 1 }],
  columnGap: 0,
  rowGap: 0,
  justify: "stretch",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

test("flex wrap toggle + align-content select store the spec fields", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "ext-toolbar-flex" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.4, rotation: 0 },
  });
  const id = await lastFrameId(page);
  await setLayout(page, id, FLEX);
  await selectViaVm(page, id);

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  // The flex "레이아웃" group is defaultOpen — the wrap toggle is visible.
  const wrapToggle = popover.getByTestId("flex-wrap-toggle");
  await expect(wrapToggle).toBeVisible();
  await wrapToggle.click();

  await expect.poll(() => layoutField(page, id, "wrap")).toBe("wrap");
  // align-content Select appears once wrapped → default 'start' stored on change.
  await expect.poll(() => layoutField(page, id, "alignContent")).toBeTruthy();
});

test("grid auto-flow toggle + dense switch store the spec fields", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "ext-toolbar-grid" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.4, rotation: 0 },
  });
  const id = await lastFrameId(page);
  await setLayout(page, id, GRID);
  await selectViaVm(page, id);

  await page.getByTestId("toolbar-more-trigger").click();
  const popover = page.getByTestId("toolbar-more-content");
  // Expand the grid "정렬" group (not default-open).
  await popover.getByTestId("frame-grid-align-group-trigger").click();
  const dense = popover.getByTestId("grid-dense-toggle");
  await expect(dense).toBeVisible();
  await dense.click();
  await expect.poll(() => layoutField(page, id, "dense")).toBe(true);

  await popover.getByTestId("grid-autoflow-select").click();
  await page.getByTestId("grid-autoflow-select-option-column").click();
  await expect.poll(() => layoutField(page, id, "autoFlow")).toBe("column");
});
