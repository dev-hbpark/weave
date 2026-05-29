// Rotated item fits its OUTER bounds into a flex/grid cell (user spec
// 2026-05-29). When a frame's layout becomes grid, a rotated child must
// shrink so its axis-aligned bounding box fits the assigned cell, keeping
// its rotation — verified end-to-end through the vendored agocraft layout
// adapter (the same path the persistent layout and multi-arrange share).

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

function gridSpec(cols: number, rows: number): Record<string, unknown> {
  return {
    kind: "auto-grid",
    columns: Array.from({ length: cols }, () => ({ kind: "fr", value: 1 })),
    rows: Array.from({ length: rows }, () => ({ kind: "fr", value: 1 })),
    columnGap: 0,
    rowGap: 0,
    justify: "stretch",
    align: "stretch",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

type Frame = { x: number; y: number; width: number; height: number; rotation?: number };

async function rootChildIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = (
      window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<{ id: string | number }> } };
      }
    ).__weaveDoc;
    return doc === undefined ? [] : doc.root.children.map((c) => String(c.id));
  });
}

async function childIdsOf(
  page: import("@playwright/test").Page,
  parentId: string,
): Promise<string[]> {
  return page.evaluate((pid) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return [];
    function find(n: Node): Node | null {
      if (String(n.id) === pid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    const node = find(doc.root);
    return node === null ? [] : node.children.map((c) => String(c.id));
  }, parentId);
}

async function readFrame(page: import("@playwright/test").Page, id: string): Promise<Frame | null> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: string | number;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    if (doc === undefined) return null;
    function find(n: Node): Node | null {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    const node = find(doc.root);
    return node === null ? null : ((node.attrs as { frame?: Frame }).frame ?? null);
  }, id);
}

async function setRotation(page: import("@playwright/test").Page, id: string, rotation: number) {
  await page.evaluate(
    ({ id, rotation }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      (window as unknown as { __weaveEditor?: Editor }).__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        patch: (it: { attrs: { frame?: Frame } }) => ({
          ...it,
          attrs: { ...it.attrs, frame: { ...(it.attrs.frame as Frame), rotation } },
        }),
      });
    },
    { id, rotation },
  );
}

test("grid layout shrinks a rotated child so its outer bounds fit the cell", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  // Container frame F under root.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.6, rotation: 0 },
  });
  const fId = (await rootChildIds(page)).at(-1)!;
  // Two children inside F.
  await addFrame(page, "slide", {
    containerId: fId,
    frame: { x: 0.05, y: 0.05, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "slide", {
    containerId: fId,
    frame: { x: 0.6, y: 0.05, width: 0.3, height: 0.3, rotation: 0 },
  });
  const kids = await childIdsOf(page, fId);
  expect(kids.length).toBe(2);
  const [c1, c2] = kids as [string, string];

  // Rotate c1 by 45° BEFORE the grid (the command sets rotation regardless of
  // the canRotate handle gate), then turn F into a 2×1 grid.
  await setRotation(page, c1, Math.PI / 4);
  await page.evaluate(
    ({ fId, spec }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      (window as unknown as { __weaveEditor?: Editor }).__weaveEditor?.exec(
        "weave.frame.setLayout",
        {
          itemId: fId,
          layout: spec,
        },
      );
    },
    { fId, spec: gridSpec(2, 1) },
  );
  await page.waitForTimeout(120);

  const f1 = await readFrame(page, c1);
  const f2 = await readFrame(page, c2);
  if (f1 === null || f2 === null) throw new Error("children missing after layout");
  // Rotation preserved (NOT zeroed by the layout).
  expect(f1.rotation ?? 0).toBeCloseTo(Math.PI / 4, 4);
  // The rotated child shrank so its AABB fits the cell, while the unrotated
  // sibling fills its (same-size) cell — so the rotated raw box is smaller.
  expect(f1.width).toBeLessThan(f2.width - 1e-6);
});
