// WI-019/WI-021 MC — real-browser proof that a child's selection chrome
// reflects the manipulation constraints OWNED by the parent frame's layout.
// The agocraft LayoutEngine.getChildConstraints is the single source;
// weave's FrameStage `resolveHandles` only filters the rendered resize /
// rotate handles from it. This spec selects a child and reads which handle
// ids actually render (`data-selection-handle-id` under the child's
// `data-selection-handle-item-id`).
//
//   • absolute child  → 8 resize handles + rotate (free)
//   • flex-row child   → main-axis (e/w) resize only, NO rotate
//   • grid child       → NO resize handles, NO rotate
//
// NOTE: focused verification spec (Continuous Self-Verification), not the
// deferred B5.2 suite.

import { expect, test } from "@playwright/test";
import { prepareDesign, setSelection } from "./helpers.js";

async function addChild(
  page: import("@playwright/test").Page,
  input: {
    kind: string;
    containerId?: string;
    frame: { x: number; y: number; width: number; height: number; rotation: number };
    attrsOverride?: Record<string, unknown>;
  },
): Promise<string> {
  return page.evaluate((inp) => {
    type Editor = { exec: (name: string, input: unknown) => { ok: boolean; value?: string } };
    type Doc = { root: { id: string | number } };
    const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
    const editor = w.__weaveEditor;
    const doc = w.__weaveDoc;
    if (editor === undefined || doc === undefined) throw new Error("__weaveEditor not ready");
    const containerId = inp.containerId ?? String(doc.root.id);
    const res = editor.exec("weave.item.add", {
      kind: inp.kind,
      containerId,
      frame: inp.frame,
      ...(inp.attrsOverride !== undefined ? { attrsOverride: inp.attrsOverride } : {}),
    });
    if (!res.ok || res.value === undefined) throw new Error("weave.item.add failed");
    return res.value;
  }, input);
}

/** Read the set of handle ids (resize-*, rotate) rendered for `itemId`. */
async function readHandleIds(
  page: import("@playwright/test").Page,
  itemId: string,
): Promise<string[]> {
  return page.evaluate((id) => {
    const nodes = document.querySelectorAll(`[data-selection-handle-item-id="${id}"]`);
    const ids: string[] = [];
    nodes.forEach((n) => {
      const hid = n.getAttribute("data-selection-handle-id");
      if (hid !== null) ids.push(hid);
    });
    return ids.sort();
  }, itemId);
}

const FLEX_ROW_STRETCH = {
  kind: "auto-flex",
  direction: "row",
  gap: 0.02,
  justify: "start",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

const GRID_2COL = {
  kind: "auto-grid",
  columns: [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ],
  rows: [{ kind: "fr", value: 1 }],
  columnGap: 0,
  rowGap: 0,
  justify: "stretch",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

test("absolute child → all 8 resize handles + rotate", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Constraints-Absolute" });

  const frameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.5, rotation: 0 },
  });
  await page.waitForTimeout(120);
  const childId = await addChild(page, {
    kind: "shape",
    containerId: frameId,
    frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.3, rotation: 0 },
    attrsOverride: { shape: "rectangle" },
  });
  await page.waitForTimeout(120);

  await setSelection(page, [childId]);
  await page.waitForTimeout(150);

  const ids = await readHandleIds(page, childId);
  // eslint-disable-next-line no-console
  console.log("[verify] absolute child handles:", JSON.stringify(ids));
  expect(ids).toContain("rotate");
  for (const d of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    expect(ids).toContain(`resize-${d}`);
  }
});

test("flex-row stretch child → main-axis (e/w) resize only, no rotate", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Constraints-Flex" });

  const frameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.5, rotation: 0 },
    attrsOverride: { layout: FLEX_ROW_STRETCH },
  });
  await page.waitForTimeout(120);
  const childId = await addChild(page, {
    kind: "shape",
    containerId: frameId,
    frame: { x: 0.0, y: 0.0, width: 0.4, height: 1, rotation: 0 },
    attrsOverride: { shape: "rectangle", layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.4 } },
  });
  await page.waitForTimeout(150);

  await setSelection(page, [childId]);
  await page.waitForTimeout(150);

  const ids = await readHandleIds(page, childId);
  // eslint-disable-next-line no-console
  console.log("[verify] flex-row child handles:", JSON.stringify(ids));
  // Main axis = width (row) → e/w present; cross axis (height) stretched →
  // n/s + all corners absent; rotation disabled.
  expect(ids).toEqual(["resize-e", "resize-w"]);
});

test("grid child → no resize handles, no rotate", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Constraints-Grid" });

  const frameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.5, rotation: 0 },
    attrsOverride: { layout: GRID_2COL },
  });
  await page.waitForTimeout(120);
  const childId = await addChild(page, {
    kind: "shape",
    containerId: frameId,
    frame: { x: 0.0, y: 0.0, width: 0.5, height: 1, rotation: 0 },
    attrsOverride: { shape: "rectangle", layoutChild: { kind: "auto-grid", column: 1, columnSpan: 1, row: 1, rowSpan: 1 } },
  });
  await page.waitForTimeout(150);

  await setSelection(page, [childId]);
  await page.waitForTimeout(150);

  const ids = await readHandleIds(page, childId);
  // eslint-disable-next-line no-console
  console.log("[verify] grid child handles:", JSON.stringify(ids));
  expect(ids).toEqual([]);
});
