// WI-057 Phase 2 — draggable vertex handles for the freeform `poly`.
// Verifies in the live runtime: selecting a poly shows a handle per vertex;
// dragging a handle moves that vertex (via weave.shape.setVertices); Cmd+Z
// reverts the whole drag in one step.

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

async function addPoly(page: Page): Promise<string> {
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
    { points: TRIANGLE },
  );
  await page.waitForTimeout(120);
  return id;
}

async function readVertex(
  page: Page,
  itemId: string,
  idx: number,
): Promise<{ x: number; y: number } | undefined> {
  return page.evaluate(
    ({ cid, i }) => {
      type Pt = { x: number; y: number };
      type N = {
        id: unknown;
        attrs?: { subAttrs?: { points?: ReadonlyArray<Pt> } };
        children?: ReadonlyArray<N>;
      };
      const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
      const find = (nodes: ReadonlyArray<N>): N | undefined => {
        for (const n of nodes) {
          if (String(n.id) === cid) return n;
          const hit = find(n.children ?? []);
          if (hit !== undefined) return hit;
        }
        return undefined;
      };
      return find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs?.points?.[i];
    },
    { cid: itemId, i: idx },
  );
}

test("WI-057 — dragging a vertex handle moves the vertex; Cmd+Z reverts", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-vertex" });
  const id = await addPoly(page);
  await setSelection(page, [id]);

  // Three vertex handles appear for the selected poly.
  const h0 = page.getByTestId("poly-vertex-0");
  await expect(h0).toBeVisible();
  await expect(page.getByTestId("poly-vertex-1")).toBeVisible();
  await expect(page.getByTestId("poly-vertex-2")).toBeVisible();

  const orig = await readVertex(page, id, 0);
  expect(orig).toEqual({ x: 0.5, y: 0 });

  // Drag vertex 0 (top-center) right + down.
  const box = await h0.boundingBox();
  if (box === null) throw new Error("no handle bbox");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(30); // let the pointerdown drag loop attach
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx + (60 * i) / 6, cy + (40 * i) / 6);
    await page.waitForTimeout(10);
  }
  await page.mouse.up();
  await page.waitForTimeout(80);

  const moved = await readVertex(page, id, 0);
  if (moved === undefined) throw new Error("vertex gone");
  // x is an INTERIOR coordinate (v0.x=0.5 sits between v2.x=0 and v1.x=1) so the
  // rightward drag shows up directly in the stored ratio.
  expect(moved.x).toBeGreaterThan(0.5); // dragged right
  // y is NOT assertable on the stored ratio: v0 is the top apex, and dragging it
  // down keeps it the topmost vertex, so DR-024's frame-follows-vertices refit
  // renormalizes its y back to 0 (the box hugs the apex). The downward move is
  // therefore observable on SCREEN — assert the handle itself moved right+down.
  const movedBox = await h0.boundingBox();
  if (movedBox === null) throw new Error("handle gone");
  expect(movedBox.x + movedBox.width / 2).toBeGreaterThan(cx + 20); // moved right
  expect(movedBox.y + movedBox.height / 2).toBeGreaterThan(cy + 10); // moved down

  // One undo reverts the whole drag.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readVertex(page, id, 0)).toEqual({ x: 0.5, y: 0 });
});

async function countPoints(page: Page, itemId: string): Promise<number> {
  return page.evaluate((cid) => {
    type Pt = { x: number; y: number };
    type N = {
      id: unknown;
      attrs?: { subAttrs?: { points?: ReadonlyArray<Pt> } };
      children?: ReadonlyArray<N>;
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs?.points?.length ?? 0;
  }, itemId);
}

test("WI-057 — midpoint handle inserts a vertex (3 → 4)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-add" });
  const id = await addPoly(page);
  await setSelection(page, [id]);
  await expect(page.getByTestId("poly-midpoint-0")).toBeVisible();
  expect(await countPoints(page, id)).toBe(3);

  await page.getByTestId("poly-midpoint-0").click();
  await expect.poll(() => countPoints(page, id)).toBe(4);
});

test("WI-057 — double-click a vertex removes it, but not below min 3", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-remove" });
  const id = await addPoly(page);
  await setSelection(page, [id]);

  // Add one so we have 4, then remove one back to 3.
  await page.getByTestId("poly-midpoint-0").click();
  await expect.poll(() => countPoints(page, id)).toBe(4);

  await page.getByTestId("poly-vertex-0").dblclick();
  await expect.poll(() => countPoints(page, id)).toBe(3);

  // A closed poly cannot drop below 3 — further removal is a no-op.
  await page.getByTestId("poly-vertex-0").dblclick();
  await page.waitForTimeout(100);
  expect(await countPoints(page, id)).toBe(3);
});

// WI-057 Phase 2.1 — rotation precision, incl. the exact-45° case where the
// AABB→size solve is singular. The handle must overlay the SVG vertex's TRUE
// screen position (computed via getScreenCTM, which includes the rotation).
async function rotate(page: Page, itemId: string, rad: number): Promise<void> {
  await page.evaluate(
    ({ id, r }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        attrs: { frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: r } },
      });
    },
    { id: itemId, r: rad },
  );
  await page.waitForTimeout(120);
}

/** True screen position of poly vertex `i` from the rendered <polygon>. */
async function svgVertexScreen(
  page: Page,
  itemId: string,
  i: number,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ id, idx }) => {
      const frame = document.querySelector(`[data-frame-id="${id}"]`);
      const poly = frame?.querySelector("svg polygon") as SVGPolygonElement | null;
      const svg = poly?.ownerSVGElement;
      const ctm = poly?.getScreenCTM();
      const raw = poly?.getAttribute("points");
      if (!poly || !svg || !ctm || !raw) return null;
      const tok = raw.trim().split(/\s+/)[idx];
      if (tok === undefined) return null;
      const [vx, vy] = tok.split(",").map(Number);
      if (vx === undefined || vy === undefined) return null;
      const p = svg.createSVGPoint();
      p.x = vx;
      p.y = vy;
      const sp = p.matrixTransform(ctm);
      return { x: sp.x, y: sp.y };
    },
    { id: itemId, idx: i },
  );
}

for (const deg of [45, 30]) {
  test(`WI-057 — vertex handles overlay the true vertex at ${deg}° rotation`, async ({ page }) => {
    await prepareDesign(page, { flavor: "mixed", title: `WI-057-rot-${deg}` });
    const id = await addPoly(page);
    await rotate(page, id, (deg * Math.PI) / 180);
    await setSelection(page, [id]);
    await expect(page.getByTestId("poly-vertex-0")).toBeVisible();

    for (let i = 0; i < 3; i++) {
      const truth = await svgVertexScreen(page, id, i);
      const box = await page.getByTestId(`poly-vertex-${i}`).boundingBox();
      if (truth === null || box === null) throw new Error(`no geometry for vertex ${i}`);
      const hx = box.x + box.width / 2;
      const hy = box.y + box.height / 2;
      // Handle center must sit on the rendered vertex (≤ 3px tolerance).
      expect(Math.abs(hx - truth.x), `vertex ${i} x @${deg}°`).toBeLessThan(3);
      expect(Math.abs(hy - truth.y), `vertex ${i} y @${deg}°`).toBeLessThan(3);
    }
  });
}
