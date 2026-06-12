// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// Verifies the NEW layout features survive weave's real command path — the same
// path the Aku agent drives: weave.frame.setLayout / weave.item.setLayoutChild
// with the extended spec fields (wrap, alignContent, minmax, columnsRepeat,
// areas + child area). Asserts the child frames the engine produced, read back
// from the document. (Engine↔CSS fidelity itself is proven in the parity specs;
// this proves the field plumbing end-to-end.)

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Frame = { x: number; y: number; width: number; height: number };

async function addFrame(page: Page, layout: unknown): Promise<string> {
  const id = await page.evaluate((lay) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
      attrsOverride: { layout: lay },
    });
    return String(r.value);
  }, layout);
  await page.waitForTimeout(160);
  return id;
}

async function addChild(
  page: Page,
  parentId: string,
  frame: Frame,
  policy?: unknown,
): Promise<string> {
  const id = await page.evaluate(
    ({ pid, f, pol }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "shape",
        containerId: pid,
        frame: { ...f, rotation: 0 },
        attrsOverride: { shape: "rect", ...(pol ? { layoutChild: pol } : {}) },
      });
      return String(r.value);
    },
    { pid: parentId, f: frame, pol: policy },
  );
  await page.waitForTimeout(160);
  return id;
}

async function setLayout(page: Page, itemId: string, layout: unknown): Promise<void> {
  await page.evaluate(
    ({ id, lay }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor!.exec("weave.frame.setLayout", { itemId: id, layout: lay });
    },
    { id: itemId, lay: layout },
  );
  await page.waitForTimeout(160);
}

async function setLayoutChild(page: Page, itemId: string, policy: unknown): Promise<void> {
  await page.evaluate(
    ({ id, pol }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor!.exec("weave.item.setLayoutChild", { itemId: id, policy: pol });
    },
    { id: itemId, pol: policy },
  );
  await page.waitForTimeout(160);
}

async function frameOf(page: Page, id: string): Promise<Frame | undefined> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { frame?: Frame }; children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.frame;
  }, id);
}

const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) <= 0.01;

test("flex wrap survives setLayout command path (children flow to a 2nd line)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "ext-wrap" });
  // Frame as a wrap row; 3 children of basis 0.4 (in PARENT ratio) → 2 lines.
  const parent = await addFrame(page, {
    kind: "auto-flex",
    direction: "row",
    gap: 0,
    justify: "start",
    align: "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: "wrap",
    alignContent: "start",
  });
  const ids: string[] = [];
  for (let i = 0; i < 3; i += 1)
    ids.push(await addChild(page, parent, { x: 0, y: 0, width: 0.4, height: 0.3 }));
  // Re-apply layout so the engine reflows all three at once.
  await setLayout(page, parent, {
    kind: "auto-flex",
    direction: "row",
    gap: 0,
    justify: "start",
    align: "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: "wrap",
    alignContent: "start",
  });
  const f0 = await frameOf(page, ids[0]!);
  const f2 = await frameOf(page, ids[2]!);
  // c0 on line 1 (y≈0), c2 wrapped to line 2 (y≈0.3 = first line height).
  expect(near(f0?.y, 0), `c0.y=${f0?.y}`).toBe(true);
  expect((f2?.y ?? 0) > 0.2, `c2.y=${f2?.y} should be on a 2nd line`).toBe(true);
});

test("grid minmax + columnsRepeat survive setLayout command path", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "ext-grid-tracks" });
  // auto-fill repeat of a 0.25 ratio column → 4 columns; 1 row.
  const parent = await addFrame(page, {
    kind: "auto-grid",
    columns: [],
    rows: [{ kind: "fr", value: 1 }],
    columnGap: 0,
    rowGap: 0,
    justify: "stretch",
    align: "stretch",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    columnsRepeat: { mode: "auto-fill", track: { kind: "ratio", value: 0.25 } },
  });
  const c0 = await addChild(
    page,
    parent,
    { x: 0, y: 0, width: 0.1, height: 0.1 },
    {
      kind: "auto-grid",
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
    },
  );
  const c3 = await addChild(
    page,
    parent,
    { x: 0, y: 0, width: 0.1, height: 0.1 },
    {
      kind: "auto-grid",
      column: 4,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
    },
  );
  // Reflow.
  await setLayout(page, parent, {
    kind: "auto-grid",
    columns: [],
    rows: [{ kind: "fr", value: 1 }],
    columnGap: 0,
    rowGap: 0,
    justify: "stretch",
    align: "stretch",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    columnsRepeat: { mode: "auto-fill", track: { kind: "ratio", value: 0.25 } },
  });
  const f0 = await frameOf(page, c0);
  const f3 = await frameOf(page, c3);
  // 4 columns of width 0.25, stretch → col1 at x0 w0.25, col4 at x0.75 w0.25.
  expect(near(f0?.x, 0) && near(f0?.width, 0.25), `c0=${JSON.stringify(f0)}`).toBe(true);
  expect(near(f3?.x, 0.75) && near(f3?.width, 0.25), `c3=${JSON.stringify(f3)}`).toBe(true);
});

test("grid-template-areas + child.area survive the command path", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "ext-areas" });
  const parent = await addFrame(page, {
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
    areas: ["header header", "nav main"],
  });
  const header = await addChild(
    page,
    parent,
    { x: 0, y: 0, width: 0.1, height: 0.1 },
    {
      kind: "auto-grid",
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
      area: "header",
    },
  );
  await setLayoutChild(page, header, {
    kind: "auto-grid",
    column: 1,
    row: 1,
    columnSpan: 1,
    rowSpan: 1,
    area: "header",
  });
  const f = await frameOf(page, header);
  // header spans both columns of row 1 → x0 y0 w1 h0.5.
  expect(
    near(f?.x, 0) && near(f?.y, 0) && near(f?.width, 1) && near(f?.height, 0.5),
    `header=${JSON.stringify(f)}`,
  ).toBe(true);
});
