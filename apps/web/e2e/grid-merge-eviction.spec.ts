// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*)
// WI-227 / agocraft WI-049 / DR-062 — spreadsheet-style cell merge. When a grid
// child's span GROWS to cover cells held by siblings (a "merge"), the covered
// siblings must RELOCATE to free cells (no silent overlap). Verified through
// weave's real command path (weave.item.setLayoutChild → vendored engine).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
  await prepareDesign(page);
});

type GridPolicy = { column: number; row: number; columnSpan: number; rowSpan: number };

async function addGridFrame(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc: { root: { id: unknown } };
    };
    const r = w.__weaveEditor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
      attrsOverride: {
        layout: {
          kind: "auto-grid",
          columns: [
            { kind: "fr", value: 1 },
            { kind: "fr", value: 1 },
          ],
          rows: [
            { kind: "fr", value: 1 },
            { kind: "fr", value: 1 },
          ],
          columnGap: 0,
          rowGap: 0,
          justify: "stretch",
          align: "stretch",
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
      },
    });
    return String(r.value);
  });
}

async function addCell(page: Page, parentId: string, column: number, row: number): Promise<string> {
  return page.evaluate(
    ({ pid, col, r }) => {
      const w = window as unknown as {
        __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
      };
      const res = w.__weaveEditor.exec("weave.item.add", {
        kind: "shape",
        containerId: pid,
        frame: { x: 0, y: 0, width: 0.4, height: 0.4, rotation: 0 },
        attrsOverride: {
          shape: "rect",
          layoutChild: { kind: "auto-grid", column: col, row: r, columnSpan: 1, rowSpan: 1 },
        },
      });
      return String(res.value);
    },
    { pid: parentId, col: column, r: row },
  );
}

async function policyOf(page: Page, itemId: string): Promise<GridPolicy> {
  return page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc: { root: unknown };
    };
    const find = (node: {
      id: unknown;
      attrs?: { layoutChild?: GridPolicy };
      children?: unknown[];
    }): GridPolicy | null => {
      if (String(node.id) === id) return node.attrs?.layoutChild ?? null;
      for (const c of (node.children ?? []) as (typeof node)[]) {
        const hit = find(c);
        if (hit) return hit;
      }
      return null;
    };
    return find(w.__weaveDoc.root as never)!;
  }, itemId);
}

test("merging a cell to 2×2 relocates the 3 covered siblings — no overlap", async ({ page }) => {
  const parent = await addGridFrame(page);
  const a = await addCell(page, parent, 1, 1);
  const b = await addCell(page, parent, 2, 1);
  const c = await addCell(page, parent, 1, 2);
  const d = await addCell(page, parent, 2, 2);

  // Merge a → 2×2 (covers the whole 2×2 grid).
  await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveEditor: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor.exec("weave.item.setLayoutChild", {
      itemId: id,
      policy: { kind: "auto-grid", column: 1, row: 1, columnSpan: 2, rowSpan: 2 },
    });
  }, a);
  await page.waitForTimeout(200);

  const pa = await policyOf(page, a);
  expect(pa.columnSpan).toBe(2);
  expect(pa.rowSpan).toBe(2);

  // b, c, d must have moved OUT of the 2×2 anchor block (rows ≥ 3) and occupy
  // distinct cells — no two children share a cell, none under the merged block.
  const seen = new Set<string>(["1,1", "2,1", "1,2", "2,2"]);
  for (const id of [b, c, d]) {
    const p = await policyOf(page, id);
    const key = `${p.column},${p.row}`;
    expect(["1,1", "2,1", "1,2", "2,2"]).not.toContain(key);
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
});
