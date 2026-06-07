// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) injected in DEV.
// Regression — vertical-grid item overflowed its cell on every NON-stretch
// alignment, and only `stretch` snapped it back to the cell. Root cause: the
// child's intrinsic cell size (sizeH) was captured while it filled the frame
// (sizeH ≈ full parent), so start/center/end honored that oversized intrinsic
// and the item spilled across every row. Fix (agocraft @agocraft/layout): the
// grid/flex placement formulas clamp a non-stretch child's size to its cell, so
// an oversized intrinsic can never overflow — while a child smaller than its
// cell keeps its own size + alignment.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

// 1 column × 3 rows — a "vertical grid". Each row is 1fr → cell height ratio 1/3.
const VERTICAL_GRID = {
  kind: "auto-grid",
  columns: [{ kind: "fr", value: 1 }],
  rows: [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ],
  columnGap: 0,
  rowGap: 0,
  justify: "stretch",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
} as const;

async function childFrameHeight(page: Page, childId: string): Promise<number | undefined> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { frame?: { height?: number } }; children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.frame?.height;
  }, childId);
}

async function setGridChildAlign(
  page: Page,
  childId: string,
  align: "start" | "center" | "end" | "stretch",
  sizeH: number,
): Promise<void> {
  await page.evaluate(
    ({ cid, a, sh }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor!.exec("weave.item.setLayoutChild", {
        itemId: cid,
        policy: {
          kind: "auto-grid",
          column: 1,
          columnSpan: 1,
          row: 1,
          rowSpan: 1,
          alignSelf: a,
          sizeW: 1,
          // Contaminated intrinsic: the item's own height recorded as ~full
          // parent (what join/stretch leaves behind). Without the clamp this
          // drives start/center/end to overflow the 1/3 cell.
          sizeH: sh,
        },
      });
    },
    { cid: childId, a: align, sh: sizeH },
  );
  await page.waitForTimeout(120);
}

test("vertical-grid child clamps to its cell on every non-stretch align (no overflow)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "grid-stretch-overflow" });

  // Grid frame (1×3) with a child that fills most of it (frame height 0.9 in
  // parent ratio) — so its captured intrinsic is far larger than the 1/3 cell.
  const parentId = await page.evaluate((lay) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
      attrsOverride: { layout: lay },
    });
    return String(r.value);
  }, VERTICAL_GRID);
  await page.waitForTimeout(120);

  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: pid,
      frame: { x: 0, y: 0, width: 1, height: 0.9, rotation: 0 },
      attrsOverride: { shape: "rect" },
    });
    return String(r.value);
  }, parentId);
  await page.waitForTimeout(120);

  const cell = 1 / 3;

  // Every non-stretch align must clamp the oversized intrinsic to the cell.
  for (const align of ["start", "center", "end"] as const) {
    await setGridChildAlign(page, childId, align, 0.9);
    await expect
      .poll(() => childFrameHeight(page, childId), {
        message: `align=${align} must not overflow the 1/3 cell`,
      })
      .toBeCloseTo(cell, 5);
  }

  // Stretch fills the cell too — identical result, no longer the only "fix".
  await setGridChildAlign(page, childId, "stretch", 0.9);
  await expect.poll(() => childFrameHeight(page, childId)).toBeCloseTo(cell, 5);
});

test("vertical-grid child SMALLER than its cell keeps its own size on non-stretch", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "grid-stretch-small" });

  const parentId = await page.evaluate((lay) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
      attrsOverride: { layout: lay },
    });
    return String(r.value);
  }, VERTICAL_GRID);
  await page.waitForTimeout(120);

  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: pid,
      frame: { x: 0, y: 0, width: 1, height: 0.2, rotation: 0 },
      attrsOverride: { shape: "rect" },
    });
    return String(r.value);
  }, parentId);
  await page.waitForTimeout(120);

  // sizeH 0.2 < cell 0.333 → keeps its own size on start (not stretched up).
  await setGridChildAlign(page, childId, "start", 0.2);
  await expect.poll(() => childFrameHeight(page, childId)).toBeCloseTo(0.2, 5);
});
