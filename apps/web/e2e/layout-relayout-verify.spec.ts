// WI-043 FIX verification — real-browser proof that adding a child to a
// Flex / Grid frame auto-arranges it (the bug was "always lands center,
// no auto-arrange"). Drives the actual app through window.__weaveEditor
// (the same dev surface the other e2e specs use), reads the resulting
// child frames from window.__weaveDoc, and captures a screenshot.
//
// NOTE: this is a focused verification spec requested by the user, not the
// full B5.2 suite (5 scenarios + axe) which remains deferred under the
// Operational Readiness policy.

import { expect, test } from "@playwright/test";
import { prepareDesign, readItemFrame } from "./helpers.js";

/** Add a child via weave.item.add and return its new id (result.value). */
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
    type Editor = { exec: (name: string, input: unknown) => ExecResult };
    type Doc = { root: { id: string | number } };
    interface ExecResult {
      ok: boolean;
      value?: string;
    }
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

const FLEX_ROW = {
  kind: "auto-flex",
  direction: "row",
  gap: 0.02,
  justify: "start",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

const GRID_3COL = {
  kind: "auto-grid",
  columns: [
    { kind: "fr", value: 1 },
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

test("Flex frame auto-arranges children added into it (real browser)", async ({ page }, testInfo) => {
  await prepareDesign(page, { flavor: "mixed", title: "Flex-Verify" });

  // 1. Create a Flex-row frame in the design root.
  const flexFrameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.4, rotation: 0 },
    attrsOverride: { layout: FLEX_ROW },
  });
  // Let the staging pipeline flush into the doc.
  await page.waitForTimeout(150);

  // 2. Add three shapes INTO the flex frame, each dropped at a "wrong"
  //    spot (overlapping bottom-right). If auto-arrange works, they must
  //    NOT stay at the drop frame — the flex row must spread them.
  const childIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await addChild(page, {
      kind: "shape",
      containerId: flexFrameId,
      frame: { x: 0.85, y: 0.85, width: 0.3, height: 1, rotation: 0 },
      attrsOverride: { layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: 0.3 } },
    });
    childIds.push(id);
    await page.waitForTimeout(120);
  }

  // 3. Read each child's frame from the live doc.
  const frames = [];
  for (const id of childIds) {
    const f = await readItemFrame(page, id);
    frames.push(f);
  }

  // eslint-disable-next-line no-console
  console.log("[verify] flex child frames:", JSON.stringify(frames));

  // Assertions: every child resolved, none stuck at the 0.85 drop x, and
  // the x positions are strictly increasing (left-to-right flex spread).
  for (const f of frames) {
    expect(f).not.toBeNull();
  }
  const xs = frames.map((f) => f!.x);
  // Not all equal (the bug symptom was identical center positions).
  const allSame = xs.every((x) => Math.abs(x - xs[0]!) < 1e-6);
  expect(allSame).toBe(false);
  // Strictly increasing left → right.
  expect(xs[0]!).toBeLessThan(xs[1]!);
  expect(xs[1]!).toBeLessThan(xs[2]!);
  // None parked at the raw drop frame (0.85).
  for (const x of xs) expect(x).toBeLessThan(0.8);
  // First child hugs the left edge (justify=start → x≈0).
  expect(xs[0]!).toBeCloseTo(0, 2);

  await page.screenshot({ path: testInfo.outputPath("flex-arranged.png"), fullPage: false });
  await testInfo.attach("flex-arranged", {
    path: testInfo.outputPath("flex-arranged.png"),
    contentType: "image/png",
  });
});

test("Grid frame places children into distinct columns (real browser)", async ({ page }, testInfo) => {
  await prepareDesign(page, { flavor: "mixed", title: "Grid-Verify" });

  const gridFrameId = await addChild(page, {
    kind: "frame",
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.4, rotation: 0 },
    attrsOverride: { layout: GRID_3COL },
  });
  await page.waitForTimeout(150);

  const childIds: string[] = [];
  for (let col = 1; col <= 3; col++) {
    const id = await addChild(page, {
      kind: "shape",
      containerId: gridFrameId,
      frame: { x: 0.9, y: 0.9, width: 0.1, height: 0.1, rotation: 0 },
      attrsOverride: { layoutChild: { kind: "auto-grid", column: col, columnSpan: 1, row: 1, rowSpan: 1 } },
    });
    childIds.push(id);
    await page.waitForTimeout(120);
  }

  const frames = [];
  for (const id of childIds) frames.push(await readItemFrame(page, id));
  // eslint-disable-next-line no-console
  console.log("[verify] grid child frames:", JSON.stringify(frames));

  for (const f of frames) expect(f).not.toBeNull();
  // 3 equal fr columns → x ≈ 0, 1/3, 2/3; width ≈ 1/3 each.
  expect(frames[0]!.x).toBeCloseTo(0, 2);
  expect(frames[1]!.x).toBeCloseTo(1 / 3, 2);
  expect(frames[2]!.x).toBeCloseTo(2 / 3, 2);
  for (const f of frames) expect(f!.width).toBeCloseTo(1 / 3, 2);

  await page.screenshot({ path: testInfo.outputPath("grid-arranged.png"), fullPage: false });
  await testInfo.attach("grid-arranged", {
    path: testInfo.outputPath("grid-arranged.png"),
    contentType: "image/png",
  });
});
