// WI-048 — multi-selection "arrange into Flex / Grid" + hover preview.
//
// Select ≥2 same-parent items → the QuickActionBar shows Flex / Grid buttons.
// Hovering one shows a ghost preview; clicking it repositions the items into
// that layout form (one-shot, no container frame), as a single undoable batch.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addRootShapes(page: Page, n: number): Promise<string[]> {
  return page.evaluate((count) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const ed = w.__weaveEditor!;
    const rootId = String(w.__weaveDoc!.root.id);
    const ids: string[] = [];
    // Scattered positions so an arrange visibly changes them.
    const spots = [
      { x: 0.1, y: 0.1 },
      { x: 0.7, y: 0.2 },
      { x: 0.3, y: 0.6 },
      { x: 0.6, y: 0.7 },
    ];
    for (let i = 0; i < count; i++) {
      const s = spots[i] ?? { x: 0.1 + i * 0.05, y: 0.1 };
      const r = ed.exec("weave.item.add", {
        kind: "shape",
        containerId: rootId,
        frame: { x: s.x, y: s.y, width: 0.12, height: 0.12, rotation: 0 },
        attrsOverride: { shape: "ellipse" },
      });
      ids.push(String(r.value));
    }
    return ids;
  }, n);
}

async function selectMany(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate(
    (arr) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { setMany: (ids: Iterable<string>) => void } };
      };
      w.__weaveVm?.itemSelection.setMany(arr);
    },
    [...ids],
  );
  await page.waitForTimeout(80);
}

async function framesOf(
  page: Page,
  ids: ReadonlyArray<string>,
): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(
    (arr) => {
      type Ch = { id: unknown; attrs?: { frame?: { x: number; y: number } } };
      const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
      const kids = w.__weaveDoc?.root.children ?? [];
      return arr.map((id) => {
        const it = kids.find((c) => String(c.id) === id);
        return { x: it?.attrs?.frame?.x ?? -1, y: it?.attrs?.frame?.y ?? -1 };
      });
    },
    [...ids],
  );
}

test("WI-048 — multi-select shows Flex/Grid buttons; hover previews; Grid arranges into a matrix", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-048-grid" });
  const ids = await addRootShapes(page, 4);
  await page.waitForTimeout(120);
  await selectMany(page, ids);

  // Buttons surface in the multi QuickActionBar.
  const gridBtn = page.getByTestId("cmd-multi-layout-grid");
  await expect(gridBtn).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId("cmd-multi-layout-flex")).toBeVisible();

  // Hover → ghost preview overlay appears.
  await gridBtn.hover();
  await expect(page.getByTestId("arrange-preview-overlay")).toBeVisible({ timeout: 2_000 });

  // Click → 4 items arranged into a 2×2 (≥2 distinct x and y).
  await gridBtn.click();
  await expect
    .poll(async () => {
      const fr = await framesOf(page, ids);
      const round = (v: number) => Math.round(v * 100) / 100;
      const xs = new Set(fr.map((f) => round(f.x))).size;
      const ys = new Set(fr.map((f) => round(f.y))).size;
      return `${xs}x${ys}`;
    })
    .toBe("2x2");
});

test("WI-048 — Flex arranges the selection into a single row (shared top edge)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-048-flex" });
  const ids = await addRootShapes(page, 3);
  await page.waitForTimeout(120);
  await selectMany(page, ids);

  const flexBtn = page.getByTestId("cmd-multi-layout-flex");
  await expect(flexBtn).toBeVisible({ timeout: 3_000 });
  await flexBtn.click();

  await expect
    .poll(async () => {
      const fr = await framesOf(page, ids);
      const round = (v: number) => Math.round(v * 100) / 100;
      const distinctX = new Set(fr.map((f) => round(f.x))).size;
      const distinctY = new Set(fr.map((f) => round(f.y))).size;
      // A row → 3 distinct x, all share one y.
      return `${distinctX}/${distinctY}`;
    })
    .toBe("3/1");
});
