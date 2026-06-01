// WI-069 — select a vertex (visually highlighted) + Delete/Backspace removes it.
// Complements the right-click "꼭지점 삭제" menu (WI-068) with a fast keyboard path.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const TRIANGLE = [
  { x: 0.5, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const QUAD = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

async function addPoly(
  page: Page,
  points: ReadonlyArray<{ x: number; y: number }>,
): Promise<string> {
  const id = await page.evaluate(
    ({ points }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "shape",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
        attrsOverride: { shape: "poly", subAttrs: { shape: "poly", points, closed: true } },
      });
      return String(r.value);
    },
    { points },
  );
  await page.waitForTimeout(120);
  return id;
}

async function readFrame(
  page: Page,
  id: string,
): Promise<{ width: number; height: number } | null> {
  return page.evaluate((cid) => {
    type N = {
      id: unknown;
      attrs?: { frame?: { width?: number; height?: number } };
      children?: N[];
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: N[] } } };
    const find = (ns: N[]): N | undefined => {
      for (const n of ns) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    const f = find(w.__weaveDoc?.root.children ?? [])?.attrs?.frame;
    return f === undefined ? null : { width: f.width ?? 0, height: f.height ?? 0 };
  }, id);
}

async function countPoints(page: Page, id: string): Promise<number> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { subAttrs?: { points?: unknown[] } }; children?: N[] };
    const w = window as unknown as { __weaveDoc?: { root: { children: N[] } } };
    const find = (ns: N[]): N | undefined => {
      for (const n of ns) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs?.points?.length ?? 0;
  }, id);
}

test("WI-069 — click selects a vertex (highlighted); Delete removes it; Cmd+Z restores", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-069" });
  const id = await addPoly(page, QUAD); // 4 points → deletable to 3
  await setSelection(page, [id]);
  await expect.poll(() => countPoints(page, id)).toBe(4);

  // Click vertex 1 → SELECTED (visually marked).
  const v1 = page.getByTestId("poly-vertex-1");
  await v1.click();
  await expect(v1).toHaveAttribute("data-selected", "true");
  // The others are not selected.
  await expect(page.getByTestId("poly-vertex-0")).not.toHaveAttribute("data-selected", "true");

  // Delete removes the selected vertex (4 → 3).
  await page.keyboard.press("Delete");
  await expect.poll(() => countPoints(page, id)).toBe(3);

  // One undo restores it.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => countPoints(page, id)).toBe(4);
});

test("WI-069 — deleting a vertex refits the rubber-band frame (DR-024)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-069-refit" });
  // House pentagon: the apex (index 2) is the SOLE y-min. Deleting it must
  // shrink the frame's height (the rubber-band recomputes to the survivors).
  const id = await addPoly(page, [
    { x: 0, y: 1 },
    { x: 0, y: 0.4 },
    { x: 0.5, y: 0 }, // apex — sole top
    { x: 1, y: 0.4 },
    { x: 1, y: 1 },
  ]);
  await setSelection(page, [id]);

  const before = await readFrame(page, id);
  if (before === null) throw new Error("no frame");

  await page.getByTestId("poly-vertex-2").click(); // select the apex
  await page.keyboard.press("Delete");
  await expect.poll(() => countPoints(page, id)).toBe(4);

  // Frame height shrank (apex removed → top moved down) — rubber-band recomputed.
  await expect
    .poll(async () => {
      const f = await readFrame(page, id);
      return f === null ? 1 : f.height;
    })
    .toBeLessThan(before.height - 0.001);
});

test("WI-069 — Delete is a no-op below the min, and Escape clears the vertex selection", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-069-min" });
  const id = await addPoly(page, TRIANGLE); // 3 points (the closed-poly min)
  await setSelection(page, [id]);

  const v0 = page.getByTestId("poly-vertex-0");
  await v0.click();
  await expect(v0).toHaveAttribute("data-selected", "true");

  // At the min, Delete must NOT remove (stays 3).
  await page.keyboard.press("Delete");
  await page.waitForTimeout(80);
  expect(await countPoints(page, id)).toBe(3);
  // …and the vertex selection cleared.
  await expect(page.getByTestId("poly-vertex-0")).not.toHaveAttribute("data-selected", "true");

  // Re-select, then Escape clears the highlight.
  await page.getByTestId("poly-vertex-1").click();
  await expect(page.getByTestId("poly-vertex-1")).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("poly-vertex-1")).not.toHaveAttribute("data-selected", "true");
});
