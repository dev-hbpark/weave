// WI-047 — a child inside a flex / grid frame must accept ordinary property
// edits (opacity, fill, …). Regression: `weave.item.update` ran the
// LayoutEngine relayout on EVERY edit (not only frame changes); for a layout
// child the relayout emitted full-attrs reflow patches computed from the
// pre-update document, appended after the edit, reverting it. Absolute frames
// were unaffected (no-layout parents emit no reflow patches).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type GridLayout = { kind: "auto-grid" };
type FlexLayout = { kind: "auto-flex" };

const GRID_SPEC = {
  kind: "auto-grid",
  columns: [{ kind: "fr", value: 1 }],
  rows: [{ kind: "fr", value: 1 }],
  columnGap: 0,
  rowGap: 0,
  justify: "stretch",
  align: "stretch",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
} as const;

const FLEX_SPEC = {
  kind: "auto-flex",
  direction: "row",
  gap: 0,
  justify: "start",
  align: "start",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
} as const;

async function makeFrameWithChild(
  page: Page,
  layout: GridLayout | FlexLayout | typeof GRID_SPEC | typeof FLEX_SPEC,
): Promise<{ parentId: string; childId: string }> {
  const parentId = await page.evaluate((lay) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
      attrsOverride: { layout: lay },
    });
    return String(r.value);
  }, layout);
  await page.waitForTimeout(120);
  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: pid,
      frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotation: 0 },
      attrsOverride: { shape: "ellipse" },
    });
    return String(r.value);
  }, parentId);
  await page.waitForTimeout(120);
  return { parentId, childId };
}

async function updateChildOpacity(page: Page, childId: string, value: number): Promise<void> {
  await page.evaluate(
    ({ cid, v }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: cid,
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, opacity: v },
        }),
      });
    },
    { cid: childId, v: value },
  );
  await page.waitForTimeout(120);
}

async function childOpacity(page: Page, childId: string): Promise<number | undefined> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { opacity?: number }; children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.opacity;
  }, childId);
}

test("WI-047 — grid-frame child accepts a property edit (opacity persists)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-047-grid" });
  const { childId } = await makeFrameWithChild(page, GRID_SPEC);
  await updateChildOpacity(page, childId, 0.33);
  await expect.poll(() => childOpacity(page, childId)).toBe(0.33);
});

test("WI-047 — flex-frame child accepts a property edit (opacity persists)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-047-flex" });
  const { childId } = await makeFrameWithChild(page, FLEX_SPEC);
  await updateChildOpacity(page, childId, 0.42);
  await expect.poll(() => childOpacity(page, childId)).toBe(0.42);
});

test("WI-047 — absolute-frame child still accepts a property edit (control)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-047-abs" });
  // No layout → absolute container.
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
    });
    return String(r.value);
  });
  await page.waitForTimeout(120);
  const childId = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: pid,
      frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotation: 0 },
      attrsOverride: { shape: "ellipse" },
    });
    return String(r.value);
  }, parentId);
  await page.waitForTimeout(120);
  await updateChildOpacity(page, childId, 0.5);
  await expect.poll(() => childOpacity(page, childId)).toBe(0.5);
});
