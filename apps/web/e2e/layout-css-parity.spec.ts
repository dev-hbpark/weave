// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// Differential CSS-parity harness for @agocraft/layout (WI-131 follow-up).
//
// The layout engine is a GEOMETRIC simulator that outputs absolute child frames
// in parent-ratio (0..1) space — it is NOT real CSS flex/grid. This harness
// answers "within the supported subset, does the engine match what a real
// browser would lay out?" by computing the engine's frames in Node (the actual
// VENDORED adapters, post-DR-046) and comparing them to the SAME layout
// expressed as real CSS flex/grid measured via getBoundingClientRect.
//
// Buckets:
//   • MATCH — engine frame == CSS rect within tolerance (the verification).
//   • DEVIATION (intentional) — non-stretch child larger than its cell: engine
//     clamps to the cell (DR-046), real CSS overflows. Asserted as a deviation
//     so the divergence is DOCUMENTED, not silent.
//   • Unsupported CSS features (wrap / baseline / space-evenly / minmax /
//     auto-fill / dense) are NOT exercised — they are out of the engine's
//     declared subset (FR-009).
//
// Container is 1000×1000 px; measured px ÷ 1000 == engine ratio.

import {
  type ChildEntry,
  createAutoFlexAdapter,
  createAutoGridAdapter,
  type ItemFrame,
} from "@agocraft/layout";
import { expect, type Page, test } from "@playwright/test";

const SIZE = 1000;
const TOL = 0.004; // 4px / 1000 — covers sub-pixel rounding.

// ── engine side (Node) ───────────────────────────────────────────────────────

const flex = createAutoFlexAdapter();
const grid = createAutoGridAdapter();
const PARENT: ItemFrame = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };

type FlexDir = "row" | "column";
type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around";
type Align = "start" | "center" | "end" | "stretch";

interface FlexChild {
  readonly basis: number;
  readonly cross: number;
  readonly grow?: number;
  readonly shrink?: number;
  readonly alignSelf?: Align;
}

function engineFlex(
  dir: FlexDir,
  justify: FlexJustify,
  align: Align,
  gap: number,
  pad: number,
  children: readonly FlexChild[],
): (ItemFrame | undefined)[] {
  const spec = {
    kind: "auto-flex" as const,
    direction: dir,
    gap,
    justify,
    align,
    padding: { top: pad, right: pad, bottom: pad, left: pad },
  };
  const mainIsWidth = dir === "row";
  const entries: ChildEntry<never>[] = children.map((c, i) => ({
    itemId: `c${i}` as never,
    currentFrame: {
      x: 0,
      y: 0,
      width: mainIsWidth ? c.basis : c.cross,
      height: mainIsWidth ? c.cross : c.basis,
      rotation: 0,
    },
    policy: {
      kind: "auto-flex",
      grow: c.grow ?? 0,
      shrink: c.shrink ?? 1,
      basis: c.basis,
      crossSize: c.cross,
      ...(c.alignSelf !== undefined ? { alignSelf: c.alignSelf } : {}),
    } as never,
  }));
  const patches = flex.onParentResize(
    { parentSpec: spec, parentOldRatio: PARENT, parentNewRatio: PARENT },
    entries,
  );
  const byId = new Map(patches.map((p) => [String(p.itemId), p.newFrame]));
  // A child with no patch kept its currentFrame — recover it for comparison.
  return children.map((_, i) => byId.get(`c${i}`) ?? entries[i]!.currentFrame);
}

type Track = { kind: "fr"; value: number } | { kind: "ratio"; value: number } | { kind: "auto" };

interface GridChild {
  readonly column: number;
  readonly row: number;
  readonly columnSpan?: number;
  readonly rowSpan?: number;
  readonly w: number;
  readonly h: number;
  readonly justifySelf?: Align;
  readonly alignSelf?: Align;
}

function engineGrid(
  columns: readonly Track[],
  rows: readonly Track[],
  justify: Align,
  align: Align,
  columnGap: number,
  rowGap: number,
  pad: number,
  children: readonly GridChild[],
): (ItemFrame | undefined)[] {
  const spec = {
    kind: "auto-grid" as const,
    columns,
    rows,
    columnGap,
    rowGap,
    justify,
    align,
    padding: { top: pad, right: pad, bottom: pad, left: pad },
  };
  const entries: ChildEntry<never>[] = children.map((c, i) => ({
    itemId: `c${i}` as never,
    currentFrame: { x: 0, y: 0, width: c.w, height: c.h, rotation: 0 },
    policy: {
      kind: "auto-grid",
      column: c.column,
      row: c.row,
      columnSpan: c.columnSpan ?? 1,
      rowSpan: c.rowSpan ?? 1,
      sizeW: c.w,
      sizeH: c.h,
      ...(c.justifySelf !== undefined ? { justifySelf: c.justifySelf } : {}),
      ...(c.alignSelf !== undefined ? { alignSelf: c.alignSelf } : {}),
    } as never,
  }));
  const patches = grid.onParentResize(
    { parentSpec: spec, parentOldRatio: PARENT, parentNewRatio: PARENT },
    entries,
  );
  const byId = new Map(patches.map((p) => [String(p.itemId), p.newFrame]));
  return children.map((_, i) => byId.get(`c${i}`) ?? entries[i]!.currentFrame);
}

// ── CSS side (browser) ───────────────────────────────────────────────────────

const J_MAP: Record<FlexJustify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
};
const A_MAP: Record<Align, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};
const GA_MAP: Record<Align, string> = {
  start: "start",
  center: "center",
  end: "end",
  stretch: "stretch",
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Build the CSS flex container in the page and return child rects as ratios. */
function cssFlex(
  page: Page,
  dir: FlexDir,
  justify: FlexJustify,
  align: Align,
  gap: number,
  pad: number,
  children: readonly FlexChild[],
): Promise<Rect[]> {
  return page.evaluate(
    ({ dir, justify, align, gap, pad, children, SIZE, J_MAP, A_MAP }) => {
      const host = document.getElementById("host")!;
      host.innerHTML = "";
      const c = document.createElement("div");
      const mainIsWidth = dir === "row";
      c.style.cssText = [
        "position:absolute;left:0;top:0;box-sizing:border-box;border:0;margin:0",
        `width:${SIZE}px;height:${SIZE}px`,
        "display:flex",
        `flex-direction:${dir}`,
        `justify-content:${J_MAP[justify]}`,
        `align-items:${A_MAP[align]}`,
        `gap:${gap * SIZE}px`,
        `padding:${pad * SIZE}px`,
      ].join(";");
      for (const ch of children) {
        const el = document.createElement("div");
        const css = [
          "box-sizing:border-box;margin:0;flex:none",
          `flex-grow:${ch.grow ?? 0}`,
          `flex-shrink:${ch.shrink ?? 1}`,
          `flex-basis:${ch.basis * SIZE}px`,
        ];
        // Cross size: definite for non-stretch; auto so CSS stretches it.
        const effAlign = ch.alignSelf ?? align;
        if (ch.alignSelf) css.push(`align-self:${A_MAP[ch.alignSelf]}`);
        const crossPx = `${ch.cross * SIZE}px`;
        if (mainIsWidth) css.push(effAlign === "stretch" ? "height:auto" : `height:${crossPx}`);
        else css.push(effAlign === "stretch" ? "width:auto" : `width:${crossPx}`);
        el.style.cssText = css.join(";");
        c.appendChild(el);
      }
      host.appendChild(c);
      const cb = c.getBoundingClientRect();
      const out = Array.from(c.children).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          x: (r.left - cb.left) / SIZE,
          y: (r.top - cb.top) / SIZE,
          width: r.width / SIZE,
          height: r.height / SIZE,
        };
      });
      return out;
    },
    { dir, justify, align, gap, pad, children, SIZE, J_MAP, A_MAP },
  );
}

function trackCss(t: Track): string {
  if (t.kind === "fr") return `${t.value}fr`;
  if (t.kind === "ratio") return `${t.value * SIZE}px`;
  return "auto";
}

function cssGrid(
  page: Page,
  columns: readonly Track[],
  rows: readonly Track[],
  justify: Align,
  align: Align,
  columnGap: number,
  rowGap: number,
  pad: number,
  children: readonly GridChild[],
): Promise<Rect[]> {
  const cols = columns.map(trackCss).join(" ");
  const rws = rows.map(trackCss).join(" ");
  return page.evaluate(
    ({ cols, rws, justify, align, columnGap, rowGap, pad, children, SIZE, GA_MAP }) => {
      const host = document.getElementById("host")!;
      host.innerHTML = "";
      const c = document.createElement("div");
      c.style.cssText = [
        "position:absolute;left:0;top:0;box-sizing:border-box;border:0;margin:0",
        `width:${SIZE}px;height:${SIZE}px`,
        "display:grid",
        `grid-template-columns:${cols}`,
        `grid-template-rows:${rws}`,
        `column-gap:${columnGap * SIZE}px`,
        `row-gap:${rowGap * SIZE}px`,
        `justify-items:${GA_MAP[justify]}`,
        `align-items:${GA_MAP[align]}`,
        `padding:${pad * SIZE}px`,
      ].join(";");
      for (const ch of children) {
        const el = document.createElement("div");
        const css = [
          "box-sizing:border-box;margin:0",
          `grid-column:${ch.column} / span ${ch.columnSpan ?? 1}`,
          `grid-row:${ch.row} / span ${ch.rowSpan ?? 1}`,
        ];
        const js = ch.justifySelf ?? justify;
        const al = ch.alignSelf ?? align;
        if (ch.justifySelf) css.push(`justify-self:${GA_MAP[ch.justifySelf]}`);
        if (ch.alignSelf) css.push(`align-self:${GA_MAP[ch.alignSelf]}`);
        css.push(js === "stretch" ? "width:auto" : `width:${ch.w * SIZE}px`);
        css.push(al === "stretch" ? "height:auto" : `height:${ch.h * SIZE}px`);
        el.style.cssText = css.join(";");
        c.appendChild(el);
      }
      host.appendChild(c);
      const cb = c.getBoundingClientRect();
      return Array.from(c.children).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          x: (r.left - cb.left) / SIZE,
          y: (r.top - cb.top) / SIZE,
          width: r.width / SIZE,
          height: r.height / SIZE,
        };
      });
    },
    { cols, rws, justify, align, columnGap, rowGap, pad, children, SIZE, GA_MAP },
  );
}

// ── comparison ───────────────────────────────────────────────────────────────

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOL;
}
function frameMatchesRect(f: ItemFrame | undefined, r: Rect): boolean {
  return (
    f !== undefined &&
    near(f.x, r.x) &&
    near(f.y, r.y) &&
    near(f.width, r.width) &&
    near(f.height, r.height)
  );
}

let blankReady = false;
async function ensurePage(page: Page): Promise<void> {
  if (blankReady) return;
  await page.setContent('<div id="host" style="position:relative"></div>');
  blankReady = true;
}

interface Mismatch {
  label: string;
  i: number;
  engine: ItemFrame | undefined;
  css: Rect;
}

// ── tests ────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  blankReady = false;
  await ensurePage(page);
});

test("FLEX — justify × align × direction parity (children fit the line)", async ({ page }) => {
  const dirs: FlexDir[] = ["row", "column"];
  const justifies: FlexJustify[] = ["start", "center", "end", "space-between", "space-around"];
  const aligns: Align[] = ["start", "center", "end", "stretch"];
  // 3 children whose basis sum (0.6) < available (1) so justify is visible, and
  // cross (0.3) < line so no clamp divergence — pure alignment fidelity.
  const children: FlexChild[] = [
    { basis: 0.2, cross: 0.3 },
    { basis: 0.2, cross: 0.3 },
    { basis: 0.2, cross: 0.3 },
  ];
  const mismatches: Mismatch[] = [];
  let cases = 0;
  for (const dir of dirs)
    for (const justify of justifies)
      for (const align of aligns) {
        const eng = engineFlex(dir, justify, align, 0, 0, children);
        const css = await cssFlex(page, dir, justify, align, 0, 0, children);
        for (let i = 0; i < children.length; i += 1) {
          cases += 1;
          if (!frameMatchesRect(eng[i], css[i]!))
            mismatches.push({
              label: `${dir}/${justify}/${align}`,
              i,
              engine: eng[i],
              css: css[i]!,
            });
        }
      }
  if (mismatches.length) console.log("FLEX mismatches:", JSON.stringify(mismatches, null, 2));
  console.log(`FLEX parity: ${cases - mismatches.length}/${cases} child frames match CSS`);
  expect(mismatches).toEqual([]);
});

test("FLEX — gap + padding + grow/shrink parity", async ({ page }) => {
  const mismatches: Mismatch[] = [];
  const scenarios: Array<{
    label: string;
    dir: FlexDir;
    justify: FlexJustify;
    align: Align;
    gap: number;
    pad: number;
    children: FlexChild[];
  }> = [
    {
      label: "gap",
      dir: "row",
      justify: "start",
      align: "start",
      gap: 0.05,
      pad: 0,
      children: [
        { basis: 0.2, cross: 0.3 },
        { basis: 0.2, cross: 0.3 },
        { basis: 0.2, cross: 0.3 },
      ],
    },
    {
      label: "padding",
      dir: "row",
      justify: "start",
      align: "start",
      gap: 0,
      pad: 0.1,
      children: [
        { basis: 0.2, cross: 0.3 },
        { basis: 0.2, cross: 0.3 },
      ],
    },
    {
      label: "gap+padding+col",
      dir: "column",
      justify: "center",
      align: "end",
      gap: 0.04,
      pad: 0.08,
      children: [
        { basis: 0.2, cross: 0.3 },
        { basis: 0.2, cross: 0.3 },
      ],
    },
    {
      label: "grow",
      dir: "row",
      justify: "start",
      align: "start",
      gap: 0,
      pad: 0,
      children: [
        { basis: 0.2, cross: 0.3, grow: 1 },
        { basis: 0.2, cross: 0.3, grow: 1 },
      ],
    },
    {
      label: "grow-weighted",
      dir: "row",
      justify: "start",
      align: "start",
      gap: 0,
      pad: 0,
      children: [
        { basis: 0.1, cross: 0.3, grow: 1 },
        { basis: 0.1, cross: 0.3, grow: 3 },
      ],
    },
    {
      label: "shrink",
      dir: "row",
      justify: "start",
      align: "start",
      gap: 0,
      pad: 0,
      children: [
        { basis: 0.7, cross: 0.3, shrink: 1 },
        { basis: 0.7, cross: 0.3, shrink: 1 },
      ],
    },
  ];
  for (const s of scenarios) {
    const eng = engineFlex(s.dir, s.justify, s.align, s.gap, s.pad, s.children);
    const css = await cssFlex(page, s.dir, s.justify, s.align, s.gap, s.pad, s.children);
    for (let i = 0; i < s.children.length; i += 1)
      if (!frameMatchesRect(eng[i], css[i]!))
        mismatches.push({ label: s.label, i, engine: eng[i], css: css[i]! });
  }
  if (mismatches.length)
    console.log("FLEX gap/grow mismatches:", JSON.stringify(mismatches, null, 2));
  expect(mismatches).toEqual([]);
});

test("GRID — justify × align parity on fr+ratio tracks (children fit cells)", async ({ page }) => {
  const trackSets: Array<{ label: string; cols: Track[]; rows: Track[] }> = [
    {
      label: "3fr×1",
      cols: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
      rows: [{ kind: "fr", value: 1 }],
    },
    {
      label: "1×3fr",
      cols: [{ kind: "fr", value: 1 }],
      rows: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
    },
    {
      label: "2fr-uneven",
      cols: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 2 },
      ],
      rows: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
    },
    {
      label: "ratio+fr",
      cols: [
        { kind: "ratio", value: 0.3 },
        { kind: "fr", value: 1 },
      ],
      rows: [
        { kind: "ratio", value: 0.25 },
        { kind: "fr", value: 1 },
      ],
    },
  ];
  const aligns: Align[] = ["start", "center", "end", "stretch"];
  const mismatches: Mismatch[] = [];
  let cases = 0;
  for (const ts of trackSets) {
    const nCols = ts.cols.length;
    const nRows = ts.rows.length;
    // one small child (0.15×0.12) per cell — fits even the smallest track.
    const children: GridChild[] = [];
    for (let r = 1; r <= nRows; r += 1)
      for (let cc = 1; cc <= nCols; cc += 1)
        children.push({ column: cc, row: r, w: 0.15, h: 0.12 });
    for (const justify of aligns)
      for (const align of aligns) {
        const eng = engineGrid(ts.cols, ts.rows, justify, align, 0, 0, 0, children);
        const css = await cssGrid(page, ts.cols, ts.rows, justify, align, 0, 0, 0, children);
        for (let i = 0; i < children.length; i += 1) {
          cases += 1;
          if (!frameMatchesRect(eng[i], css[i]!))
            mismatches.push({
              label: `${ts.label}/${justify}/${align}`,
              i,
              engine: eng[i],
              css: css[i]!,
            });
        }
      }
  }
  if (mismatches.length) console.log("GRID mismatches:", JSON.stringify(mismatches, null, 2));
  console.log(`GRID parity: ${cases - mismatches.length}/${cases} child frames match CSS`);
  expect(mismatches).toEqual([]);
});

test("GRID — gap + padding + span parity", async ({ page }) => {
  const cols: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const rows: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const mismatches: Mismatch[] = [];
  const scenarios: Array<{
    label: string;
    cg: number;
    rg: number;
    pad: number;
    children: GridChild[];
  }> = [
    {
      label: "gap",
      cg: 0.04,
      rg: 0.06,
      pad: 0,
      children: [
        { column: 1, row: 1, w: 0.15, h: 0.12 },
        { column: 2, row: 1, w: 0.15, h: 0.12 },
        { column: 3, row: 2, w: 0.15, h: 0.12 },
      ],
    },
    {
      label: "padding",
      cg: 0,
      rg: 0,
      pad: 0.1,
      children: [
        { column: 1, row: 1, w: 0.15, h: 0.12 },
        { column: 3, row: 2, w: 0.15, h: 0.12 },
      ],
    },
    {
      label: "colspan",
      cg: 0.03,
      rg: 0.03,
      pad: 0.05,
      children: [
        { column: 1, row: 1, columnSpan: 2, w: 0.15, h: 0.12 },
        { column: 3, row: 1, w: 0.15, h: 0.12 },
      ],
    },
    {
      label: "rowspan",
      cg: 0.03,
      rg: 0.03,
      pad: 0,
      children: [
        { column: 1, row: 1, rowSpan: 2, w: 0.15, h: 0.12 },
        { column: 2, row: 1, w: 0.15, h: 0.12 },
      ],
    },
  ];
  for (const s of scenarios) {
    // span cells are large → use stretch so engine & CSS both fill the spanned area.
    const childrenStretch = s.children.map((c) => ({
      ...c,
      justifySelf: "stretch" as Align,
      alignSelf: "stretch" as Align,
    }));
    const eng = engineGrid(cols, rows, "stretch", "stretch", s.cg, s.rg, s.pad, childrenStretch);
    const css = await cssGrid(
      page,
      cols,
      rows,
      "stretch",
      "stretch",
      s.cg,
      s.rg,
      s.pad,
      childrenStretch,
    );
    for (let i = 0; i < s.children.length; i += 1)
      if (!frameMatchesRect(eng[i], css[i]!))
        mismatches.push({ label: s.label, i, engine: eng[i], css: css[i]! });
  }
  if (mismatches.length)
    console.log("GRID gap/span mismatches:", JSON.stringify(mismatches, null, 2));
  expect(mismatches).toEqual([]);
});

test("DEVIATION (intentional, DR-046) — oversized non-stretch child: engine clamps, CSS overflows", async ({
  page,
}) => {
  // 1 col × 3 rows, a child intrinsically taller (h=0.9) than its 1/3 cell.
  const cols: Track[] = [{ kind: "fr", value: 1 }];
  const rows: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const cell = 1 / 3;
  for (const align of ["start", "center", "end"] as const) {
    const child: GridChild[] = [{ column: 1, row: 1, w: 0.15, h: 0.9, alignSelf: align }];
    const eng = engineGrid(cols, rows, "start", "start", 0, 0, 0, child);
    const css = await cssGrid(page, cols, rows, "start", "start", 0, 0, 0, child);
    // Engine: clamped to the cell.
    expect(eng[0]?.height).toBeCloseTo(cell, 5);
    // Real CSS: overflows the cell (height stays ~0.9). This is the documented
    // divergence — the engine deliberately does NOT reproduce CSS overflow here.
    expect(css[0]!.height).toBeGreaterThan(cell + 0.2);
  }
  console.log(
    "DEVIATION confirmed: engine clamps oversized non-stretch to cell; CSS overflows (DR-046).",
  );
});
