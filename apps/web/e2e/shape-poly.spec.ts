// WI-057 — freeform polygon ("poly"). Verifies the full slice in the live
// runtime: create a poly shape, reshape its vertices via the dedicated
// `weave.shape.setVertices` command (all mutation goes through a command),
// confirm it renders as an SVG <polygon>/<polyline>, Cmd+Z reverts, and the
// guards reject bad input.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

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
        frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
        attrsOverride: { shape: "poly", subAttrs: { shape: "poly", points, closed: true } },
      });
      return String(r.value);
    },
    { points: TRIANGLE },
  );
  await page.waitForTimeout(120);
  return id;
}

async function setVertices(
  page: Page,
  itemId: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const ok = await page.evaluate(
    ({ itemId, input }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean } };
      };
      const r = w.__weaveEditor!.exec("weave.shape.setVertices", { itemId, ...input });
      return r.ok !== false;
    },
    { itemId, input },
  );
  await page.waitForTimeout(120);
  return ok;
}

async function readPoly(
  page: Page,
  itemId: string,
): Promise<{ shape?: string; closed?: boolean; count?: number } | undefined> {
  return page.evaluate((cid) => {
    type Pt = { x: number; y: number };
    type N = {
      id: unknown;
      attrs?: { subAttrs?: { shape?: string; closed?: boolean; points?: ReadonlyArray<Pt> } };
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
    const sa = find(w.__weaveDoc?.root.children ?? [])?.attrs?.subAttrs;
    return sa ? { shape: sa.shape, closed: sa.closed, count: sa.points?.length } : undefined;
  }, itemId);
}

test("WI-057 — poly renders as <polygon>, setVertices reshapes it, Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-poly" });
  const id = await addPoly(page);
  await expect.poll(() => readPoly(page, id)).toEqual({ shape: "poly", closed: true, count: 3 });
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll("svg polygon").length))
    .toBeGreaterThanOrEqual(1);

  // reshape to a quad via the command
  expect(
    await setVertices(page, id, {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    }),
  ).toBe(true);
  await expect.poll(() => readPoly(page, id)).toEqual({ shape: "poly", closed: true, count: 4 });

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readPoly(page, id)).toEqual({ shape: "poly", closed: true, count: 3 });
});

test("WI-057 — open poly (closed:false) renders as <polyline>", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-open" });
  const id = await addPoly(page);
  expect(
    await setVertices(page, id, {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
      ],
      closed: false,
    }),
  ).toBe(true);
  await expect.poll(() => readPoly(page, id)).toEqual({ shape: "poly", closed: false, count: 2 });
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll("svg polyline").length))
    .toBeGreaterThanOrEqual(1);
  // An open poly (자유선) is a STROKE, not a filled face: the implicit closing
  // chord must NOT be painted. Assert fill:none + a visible stroke.
  const paint = await page
    .locator("svg polyline")
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fill: cs.fill, stroke: cs.stroke };
    });
  expect(paint.fill).toBe("none");
  expect(paint.stroke).not.toBe("none");
});

test("WI-057 — guards: closed poly <3 points rejected, fill unchanged", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-057-guard" });
  const id = await addPoly(page);
  expect(
    await setVertices(page, id, {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    }),
  ).toBe(false);
  await expect.poll(() => readPoly(page, id)).toEqual({ shape: "poly", closed: true, count: 3 });
});
