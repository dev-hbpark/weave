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
import { prepareDesign, readItemFrame, setSelection } from "./helpers.js";

/** Viewport-screen center of a frame/child element (by data-frame-id). */
async function centerOf(
  page: import("@playwright/test").Page,
  id: string,
): Promise<{ x: number; y: number }> {
  return page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${CSS.escape(fid)}"]`);
    if (el === null) return { x: -1, y: -1 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

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

test("selected flex frame moves on body-drag over a child (frame stays grabbable)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Constraints-FrameMove" });

  // Flex-row frame fully inside the viewport (design 1920×1080 vs 1280×720
  // viewport → keep the right edge well under ~0.66 of the design width).
  const frameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.08, y: 0.15, width: 0.45, height: 0.3, rotation: 0 },
    attrsOverride: { layout: FLEX_ROW_STRETCH },
  });
  await page.waitForTimeout(120);
  // Two shape children that FILL the frame (stretch) — so every press lands
  // on a child, not on frame body/gap. This is the case where, without the
  // movable-ancestor redirect, the container would be ungrabbable.
  const childIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = await addChild(page, {
      kind: "shape",
      containerId: frameId,
      frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 },
      attrsOverride: { shape: "rectangle", layoutChild: { kind: "auto-flex", grow: 1, shrink: 1, basis: 0.5 } },
    });
    childIds.push(id);
    await page.waitForTimeout(100);
  }

  // Select the CONTAINER frame (parent-first selection would do this on a
  // click; we set it directly to keep the test deterministic).
  await setSelection(page, [frameId]);
  await page.waitForTimeout(120);

  const before = await readItemFrame(page, frameId);
  const childBefore = await readItemFrame(page, childIds[0]!);
  expect(before).not.toBeNull();

  // Press on the FIRST child's center (it fills the left half of the frame)
  // and drag right + down. The move must translate the CONTAINER frame, not
  // the child, because the selected frame is draggable from anywhere inside.
  const c = await centerOf(page, childIds[0]!);
  expect(c.x).toBeGreaterThan(0);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(c.x + 18 * i, c.y + 10 * i);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);

  const after = await readItemFrame(page, frameId);
  const childAfter = await readItemFrame(page, childIds[0]!);
  // eslint-disable-next-line no-console
  console.log(
    "[verify] frame move:",
    JSON.stringify({ before, after, childBefore, childAfter }),
  );
  expect(after).not.toBeNull();
  // Container moved right + down (ratio coords in the design root).
  expect(after!.x).toBeGreaterThan(before!.x + 0.01);
  expect(after!.y).toBeGreaterThan(before!.y + 0.01);
  // The child's ratio WITHIN the frame is unchanged (flex still owns it —
  // it moved with the container, not independently).
  expect(childAfter!.x).toBeCloseTo(childBefore!.x, 2);
});
