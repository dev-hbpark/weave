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

/** Reparent `itemId` under `newParentId` via the command, return ok. */
async function reparent(
  page: import("@playwright/test").Page,
  itemId: string,
  newParentId: string,
): Promise<void> {
  await page.evaluate(
    ({ itemId: id, newParentId: pid }) => {
      type Editor = { exec: (name: string, input: unknown) => { ok: boolean } };
      const w = window as unknown as { __weaveEditor?: Editor };
      const editor = w.__weaveEditor;
      if (editor === undefined) throw new Error("__weaveEditor not ready");
      editor.exec("weave.item.reparent", { entries: [{ itemId: id, newParentId: pid }] });
    },
    { itemId, newParentId },
  );
}

/** Read an item's parent id + layoutChild.kind from the live doc. */
async function readParentAndPolicy(
  page: import("@playwright/test").Page,
  itemId: string,
): Promise<{ parentId: string | null; policyKind: string | null }> {
  return page.evaluate((id) => {
    type Node = { id: string | number; attrs?: { layoutChild?: { kind?: string } }; children: Node[] };
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return { parentId: null, policyKind: null };
    let parentId: string | null = null;
    let node: Node | null = null;
    const walk = (n: Node, parent: Node | null): void => {
      if (String(n.id) === id) {
        node = n;
        parentId = parent === null ? null : String(parent.id);
      }
      for (const c of n.children) walk(c, n);
    };
    walk(doc.root, null);
    const policyKind = node === null ? null : ((node as Node).attrs?.layoutChild?.kind ?? null);
    return { parentId, policyKind };
  }, itemId);
}

/** Probe the design plane for a point that hits the plane but no frame. */
async function findEmptyPlanePoint(
  page: import("@playwright/test").Page,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const plane = document.querySelector('[data-design-plane="true"]');
    if (plane === null) return null;
    const r = plane.getBoundingClientRect();
    for (let fy = 0.15; fy <= 0.85; fy += 0.1) {
      for (let fx = 0.15; fx <= 0.85; fx += 0.1) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const el = document.elementFromPoint(x, y);
        if (el === null) continue;
        if (el.closest("[data-frame-id]") === null && el.closest('[data-design-plane="true"]') !== null) {
          return { x, y };
        }
      }
    }
    return null;
  });
}

async function rootId(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: { root: { id: string | number } } }).__weaveDoc;
    return doc === undefined ? "" : String(doc.root.id);
  });
}

test("reparent GESTURE (Cmd+Shift+drag) pulls a frame's child OUT to the design root", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Reparent-To-Root" });

  // A small frame F in the top-left with a shape child S.
  const fId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.08, y: 0.12, width: 0.25, height: 0.25, rotation: 0 },
  });
  await page.waitForTimeout(120);
  const sId = await addChild(page, {
    kind: "shape",
    containerId: fId,
    frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.6, rotation: 0 },
    attrsOverride: { shape: "rectangle" },
  });
  await page.waitForTimeout(150);

  const root = await rootId(page);
  expect((await readParentAndPolicy(page, sId)).parentId).toBe(fId); // starts in F

  await setSelection(page, [sId]);
  await page.waitForTimeout(100);

  const sPos = await centerOf(page, sId);
  const empty = await findEmptyPlanePoint(page);
  expect(empty).not.toBeNull();

  // Cmd/Ctrl+Shift+drag S onto empty design-plane area → drop to ROOT.
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.mouse.move(sPos.x, sPos.y);
  await page.mouse.down();
  await page.mouse.move((sPos.x + empty!.x) / 2, (sPos.y + empty!.y) / 2, { steps: 4 });
  await page.mouse.move(empty!.x, empty!.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await page.waitForTimeout(250);

  const after = await readParentAndPolicy(page, sId);
  // eslint-disable-next-line no-console
  console.log("[verify] reparent-to-root:", JSON.stringify({ sPos, empty, root, after }));
  expect(after.parentId).toBe(root);
});

test("reparent GESTURE (Cmd+Shift+drag) moves a shape into the inner frame", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Reparent-Gesture" });

  // Flex-row frame F = [S (shape, left), F2 (inner absolute frame, right)].
  const fId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.18, width: 0.45, height: 0.28, rotation: 0 },
    attrsOverride: { layout: FLEX_ROW_STRETCH },
  });
  await page.waitForTimeout(120);
  const sId = await addChild(page, {
    kind: "shape",
    containerId: fId,
    frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 },
    attrsOverride: { shape: "rectangle", layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.49 } },
  });
  await page.waitForTimeout(120);
  const f2Id = await addChild(page, {
    kind: "frame",
    containerId: fId,
    frame: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 },
    // Inner frame has its OWN grid layout (the user's scenario).
    attrsOverride: { layout: GRID_2COL, layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.49 } },
  });
  await page.waitForTimeout(150);

  // Select S so the gesture has a settled selection to read.
  await setSelection(page, [sId]);
  await page.waitForTimeout(100);

  const sPos = await centerOf(page, sId);
  const f2Pos = await centerOf(page, f2Id);
  expect(sPos.x).toBeGreaterThan(0);
  expect(f2Pos.x).toBeGreaterThan(sPos.x); // F2 is to the right of S

  // Perform the actual Cmd/Ctrl+Shift+drag gesture. Hold the modifiers via
  // the keyboard so the PointerEvents carry metaKey/shiftKey.
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.mouse.move(sPos.x, sPos.y);
  await page.mouse.down();
  await page.mouse.move((sPos.x + f2Pos.x) / 2, (sPos.y + f2Pos.y) / 2, { steps: 4 });
  await page.mouse.move(f2Pos.x, f2Pos.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await page.waitForTimeout(250);

  const after = await readParentAndPolicy(page, sId);
  // eslint-disable-next-line no-console
  console.log("[verify] reparent gesture:", JSON.stringify({ sPos, f2Pos, after }));
  expect(after.parentId).toBe(f2Id);
  // Joined F2's grid → policy reassigned.
  expect(after.policyKind).toBe("auto-grid");
});

test("reparenting a shape into an inner grid frame makes it follow the NEW parent's layout", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Constraints-Reparent" });

  // Flex-row frame F containing a shape S (FIRST) and an inner GRID frame F2
  // (SECOND). Order matters for the assertion below: with S first, removing
  // it shifts F2 left, making the old-parent reflow observable by position.
  const fId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.08, y: 0.15, width: 0.5, height: 0.3, rotation: 0 },
    attrsOverride: { layout: FLEX_ROW_STRETCH },
  });
  await page.waitForTimeout(120);
  const sId = await addChild(page, {
    kind: "shape",
    containerId: fId,
    frame: { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 },
    attrsOverride: { shape: "rectangle", layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.49 } },
  });
  await page.waitForTimeout(120);
  const f2Id = await addChild(page, {
    kind: "frame",
    containerId: fId,
    frame: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 },
    attrsOverride: { layout: GRID_2COL, layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.49 } },
  });
  await page.waitForTimeout(150);

  // Sanity — S starts inside F with a flex policy; F2 sits to S's right.
  const beforeS = await readParentAndPolicy(page, sId);
  expect(beforeS.parentId).toBe(fId);
  expect(beforeS.policyKind).toBe("auto-flex");
  const f2Before = await readItemFrame(page, f2Id);
  expect(f2Before!.x).toBeGreaterThan(0.4); // F2 is the second (right) child

  // Reparent S into the inner grid frame F2 (the user's scenario).
  await reparent(page, sId, f2Id);
  await page.waitForTimeout(200);

  const afterS = await readParentAndPolicy(page, sId);
  const sFrame = await readItemFrame(page, sId);
  const f2After = await readItemFrame(page, f2Id);
  // eslint-disable-next-line no-console
  console.log(
    "[verify] reparent:",
    JSON.stringify({ beforeS, afterS, sFrame, f2Before, f2After }),
  );

  // S is now F2's child and follows F2's GRID layout (policy reassigned).
  expect(afterS.parentId).toBe(f2Id);
  expect(afterS.policyKind).toBe("auto-grid");
  // S placed by F2's grid (column 1 → x≈0 within F2).
  expect(sFrame!.x).toBeCloseTo(0, 2);
  // Old parent F (flex) reflowed its now-only child F2 back to the start
  // (x ~0.5 → ~0) once S left.
  expect(f2After!.x).toBeLessThan(f2Before!.x - 0.1);
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
