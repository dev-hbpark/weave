// WI-065 / DR-031 — shape ↔ line KIND conversion, verified in the live runtime.
//   • Break: right-click a closed poly's vertex handle → it becomes a `line`
//     (fresh id), opened at that vertex. Cmd+Z restores the shape.
//   • Close: right-click a free `line` → "끝점 이어 도형으로" → it becomes a
//     closed `poly` shape (fresh id). Cmd+Z restores the line.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const SQUARE_POLY = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

// Endpoints far apart (top-left ↔ bottom-left) → closing keeps BOTH as normal
// vertices (no midpoint collapse), so the drawn extent is preserved.
const OPEN_CURVE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
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
    { points: SQUARE_POLY },
  );
  await page.waitForTimeout(120);
  return id;
}

async function addLine(page: Page): Promise<string> {
  const id = await page.evaluate(
    ({ points }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "line",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
        attrsOverride: { points, smooth: true, heads: { start: "none", end: "none" } },
      });
      return String(r.value);
    },
    { points: OPEN_CURVE },
  );
  await page.waitForTimeout(120);
  return id;
}

type RootNode = {
  id: string;
  kind: string;
  closed?: boolean;
  pointCount: number;
};

async function rootNodes(page: Page): Promise<RootNode[]> {
  return page.evaluate(() => {
    type Pt = { x: number; y: number };
    type N = {
      id: unknown;
      kind: string;
      attrs?: {
        points?: ReadonlyArray<Pt>;
        subAttrs?: { points?: ReadonlyArray<Pt>; closed?: boolean };
      };
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    return (w.__weaveDoc?.root.children ?? []).map((n) => ({
      id: String(n.id),
      kind: n.kind,
      closed: n.attrs?.subAttrs?.closed,
      pointCount: (n.attrs?.points ?? n.attrs?.subAttrs?.points ?? []).length,
    }));
  });
}

test("WI-065 — right-click a poly vertex breaks it into a line; Cmd+Z restores the shape", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-065-break" });
  const polyId = await addPoly(page);
  await setSelection(page, [polyId]);

  // The poly shows a handle per vertex.
  await expect(page.getByTestId("poly-vertex-1")).toBeVisible();

  // Right-click vertex 1 → break the ring there into a `line`.
  await page.getByTestId("poly-vertex-1").click({ button: "right" });
  await expect.poll(async () => (await rootNodes(page)).map((n) => n.kind)).toEqual(["line"]);

  const after = await rootNodes(page);
  expect(after).toHaveLength(1);
  expect(after[0]!.kind).toBe("line");
  expect(after[0]!.id).not.toBe(polyId); // fresh id (new-id policy)
  expect(after[0]!.pointCount).toBe(4); // all vertices retained, ring opened

  // One undo restores the original closed poly shape.
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.id}:${ns[0]!.closed}` : "?";
    })
    .toBe(`shape:${polyId}:true`);
});

test("WI-065 — context menu closes a free line into a shape; Cmd+Z restores the line", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-065-close" });
  const lineId = await addLine(page);
  await setSelection(page, [lineId]);

  // Right-click the line on the canvas → "끝점 이어 도형으로".
  await page.locator(`[data-frame-id="${lineId}"]`).first().click({ button: "right" });
  const closeItem = page.getByTestId("ctx-close-to-shape");
  await expect(closeItem).toBeVisible();
  await closeItem.click();

  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.closed}` : "?";
    })
    .toBe("shape:true");

  const after = await rootNodes(page);
  expect(after[0]!.id).not.toBe(lineId); // fresh id
  // Endpoints far apart → all 4 vertices kept, loop closed by the edge.
  expect(after[0]!.pointCount).toBe(4);

  // One undo restores the original line.
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.id}` : "?";
    })
    .toBe(`line:${lineId}`);
});
