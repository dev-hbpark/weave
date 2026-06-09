// Differential CSS-parity harness for the WI-132 layout extensions:
// flex space-evenly + wrap + align-content + baseline, grid minmax +
// repeat(auto-fill/auto-fit) + dense + grid-template-areas.
//
// Same method as layout-css-parity.spec.ts: compute frames from the VENDORED
// engine in Node, compare to the SAME layout as real browser CSS. Container is
// 1000×1000 px; measured px ÷ 1000 == engine ratio.

import {
  type ChildEntry,
  createAutoFlexAdapter,
  createAutoGridAdapter,
  type ItemFrame,
} from "@agocraft/layout";
import { expect, type Page, test } from "@playwright/test";

const SIZE = 1000;
const TOL = 0.005;
const flex = createAutoFlexAdapter();
const grid = createAutoGridAdapter();
const PARENT: ItemFrame = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const matches = (f: ItemFrame | undefined, r: Rect) =>
  f !== undefined &&
  near(f.x, r.x) &&
  near(f.y, r.y) &&
  near(f.width, r.width) &&
  near(f.height, r.height);

let ready = false;
test.beforeEach(async ({ page }) => {
  ready = false;
  if (!ready) {
    await page.setContent('<div id="host" style="position:relative"></div>');
    ready = true;
  }
});

// ── FLEX helpers (wrap / align-content / space-evenly / baseline) ─────────────

type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
type FlexAlign = "start" | "center" | "end" | "stretch" | "baseline";
type FlexAlignContent = FlexAlign | "space-between" | "space-around" | "space-evenly";

interface FlexInput {
  justify?: FlexJustify;
  align?: FlexAlign;
  wrap?: "nowrap" | "wrap";
  alignContent?: FlexAlignContent;
  gap?: number;
  children: { basis: number; cross: number }[];
}

function engineFlex(input: FlexInput): (ItemFrame | undefined)[] {
  const spec = {
    kind: "auto-flex" as const,
    direction: "row" as const,
    gap: input.gap ?? 0,
    justify: input.justify ?? "start",
    align: input.align ?? "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: input.wrap ?? "nowrap",
    alignContent: input.alignContent ?? "start",
  };
  const entries: ChildEntry<never>[] = input.children.map((c, i) => ({
    itemId: `c${i}` as never,
    currentFrame: { x: 0.99, y: 0.99, width: 0.01, height: 0.01, rotation: 0 },
    policy: { kind: "auto-flex", grow: 0, shrink: 1, basis: c.basis, crossSize: c.cross } as never,
  }));
  const patches = flex.onParentResize(
    { parentSpec: spec, parentOldRatio: PARENT, parentNewRatio: PARENT },
    entries,
  );
  const byId = new Map(patches.map((p) => [String(p.itemId), p.newFrame]));
  return input.children.map((_, i) => byId.get(`c${i}`));
}

function cssFlex(page: Page, input: FlexInput): Promise<Rect[]> {
  const J: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    "space-between": "space-between",
    "space-around": "space-around",
    "space-evenly": "space-evenly",
  };
  const A: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
    baseline: "baseline",
  };
  const AC: Record<string, string> = {
    ...A,
    "space-between": "space-between",
    "space-around": "space-around",
    "space-evenly": "space-evenly",
  };
  return page.evaluate(
    ({ input, SIZE, J, A, AC }) => {
      const host = document.getElementById("host")!;
      host.innerHTML = "";
      const c = document.createElement("div");
      const align = input.align ?? "start";
      c.style.cssText = [
        "position:absolute;left:0;top:0;box-sizing:border-box;border:0;margin:0",
        `width:${SIZE}px;height:${SIZE}px;display:flex;flex-direction:row`,
        `flex-wrap:${input.wrap ?? "nowrap"}`,
        `justify-content:${J[input.justify ?? "start"]}`,
        `align-items:${A[align]}`,
        `align-content:${AC[input.alignContent ?? "start"]}`,
        `gap:${(input.gap ?? 0) * SIZE}px`,
      ].join(";");
      for (const ch of input.children) {
        const el = document.createElement("div");
        const css = [
          "box-sizing:border-box;margin:0;flex:none",
          `flex-basis:${ch.basis * SIZE}px`,
          // cross: auto when (align-content or align) stretches, else definite.
          align === "stretch" ? "height:auto" : `height:${ch.cross * SIZE}px`,
        ];
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
    { input, SIZE, J, A, AC },
  );
}

async function assertFlexParity(page: Page, label: string, input: FlexInput) {
  const eng = engineFlex(input);
  const css = await cssFlex(page, input);
  const bad: unknown[] = [];
  for (let i = 0; i < input.children.length; i += 1)
    if (!matches(eng[i], css[i]!)) bad.push({ label, i, engine: eng[i], css: css[i] });
  if (bad.length) console.log(`FLEX-EXT ${label}:`, JSON.stringify(bad, null, 2));
  expect(bad, label).toEqual([]);
}

// ── GRID helpers (minmax / repeat / dense / areas) ────────────────────────────

type Track =
  | { kind: "fr"; value: number }
  | { kind: "ratio"; value: number }
  | { kind: "auto" }
  | { kind: "minmax"; min: TBound; max: TBound };
type TBound = { kind: "ratio"; value: number } | { kind: "fr"; value: number } | { kind: "auto" };
type Repeat = { mode: "auto-fill" | "auto-fit"; track: Track };

function boundCss(b: TBound): string {
  return b.kind === "fr" ? `${b.value}fr` : b.kind === "auto" ? "auto" : `${b.value * SIZE}px`;
}
function trackCss(t: Track): string {
  if (t.kind === "fr") return `${t.value}fr`;
  if (t.kind === "ratio") return `${t.value * SIZE}px`;
  if (t.kind === "auto") return "auto";
  return `minmax(${boundCss(t.min)}, ${boundCss(t.max)})`;
}
function tracksCss(tracks: Track[], repeat: Repeat | undefined): string {
  if (repeat) return `repeat(${repeat.mode}, ${trackCss(repeat.track)})`;
  return tracks.map(trackCss).join(" ");
}

interface GridChildIn {
  column: number;
  row: number;
  columnSpan?: number;
  rowSpan?: number;
  w: number;
  h: number;
  area?: string;
}
interface GridInput {
  columns?: Track[];
  rows?: Track[];
  columnsRepeat?: Repeat;
  rowsRepeat?: Repeat;
  columnGap?: number;
  rowGap?: number;
  justify?: "start" | "center" | "end" | "stretch";
  align?: "start" | "center" | "end" | "stretch";
  areas?: string[];
  children: GridChildIn[];
}

function engineGrid(input: GridInput): (ItemFrame | undefined)[] {
  const spec = {
    kind: "auto-grid" as const,
    columns: input.columns ?? [],
    rows: input.rows ?? [],
    columnGap: input.columnGap ?? 0,
    rowGap: input.rowGap ?? 0,
    justify: input.justify ?? "stretch",
    align: input.align ?? "stretch",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    ...(input.columnsRepeat ? { columnsRepeat: input.columnsRepeat } : {}),
    ...(input.rowsRepeat ? { rowsRepeat: input.rowsRepeat } : {}),
    ...(input.areas ? { areas: input.areas } : {}),
  };
  const entries: ChildEntry<never>[] = input.children.map((c, i) => ({
    itemId: `c${i}` as never,
    currentFrame: { x: 0.99, y: 0.99, width: 0.01, height: 0.01, rotation: 0 },
    policy: {
      kind: "auto-grid",
      column: c.column,
      row: c.row,
      columnSpan: c.columnSpan ?? 1,
      rowSpan: c.rowSpan ?? 1,
      sizeW: c.w,
      sizeH: c.h,
      ...(c.area ? { area: c.area } : {}),
    } as never,
  }));
  const patches = grid.onParentResize(
    { parentSpec: spec, parentOldRatio: PARENT, parentNewRatio: PARENT },
    entries,
  );
  const byId = new Map(patches.map((p) => [String(p.itemId), p.newFrame]));
  return input.children.map((_, i) => byId.get(`c${i}`));
}

function cssGrid(page: Page, input: GridInput): Promise<Rect[]> {
  const cols = tracksCss(input.columns ?? [], input.columnsRepeat);
  const rows = tracksCss(input.rows ?? [], input.rowsRepeat);
  return page.evaluate(
    ({ input, cols, rows, SIZE }) => {
      const host = document.getElementById("host")!;
      host.innerHTML = "";
      const c = document.createElement("div");
      const justify = input.justify ?? "stretch";
      const align = input.align ?? "stretch";
      c.style.cssText = [
        "position:absolute;left:0;top:0;box-sizing:border-box;border:0;margin:0",
        `width:${SIZE}px;height:${SIZE}px;display:grid`,
        `grid-template-columns:${cols}`,
        `grid-template-rows:${rows}`,
        `column-gap:${(input.columnGap ?? 0) * SIZE}px`,
        `row-gap:${(input.rowGap ?? 0) * SIZE}px`,
        `justify-items:${justify}`,
        `align-items:${align}`,
        input.areas
          ? `grid-template-areas:${input.areas.map((r: string) => `"${r}"`).join(" ")}`
          : "",
      ].join(";");
      for (const ch of input.children) {
        const el = document.createElement("div");
        const css = ["box-sizing:border-box;margin:0"];
        if (ch.area) css.push(`grid-area:${ch.area}`);
        else {
          css.push(`grid-column:${ch.column} / span ${ch.columnSpan ?? 1}`);
          css.push(`grid-row:${ch.row} / span ${ch.rowSpan ?? 1}`);
        }
        css.push(justify === "stretch" ? "width:auto" : `width:${ch.w * SIZE}px`);
        css.push(align === "stretch" ? "height:auto" : `height:${ch.h * SIZE}px`);
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
    { input, cols, rows, SIZE },
  );
}

async function assertGridParity(page: Page, label: string, input: GridInput) {
  const eng = engineGrid(input);
  const css = await cssGrid(page, input);
  const bad: unknown[] = [];
  for (let i = 0; i < input.children.length; i += 1)
    if (!matches(eng[i], css[i]!)) bad.push({ label, i, engine: eng[i], css: css[i] });
  if (bad.length) console.log(`GRID-EXT ${label}:`, JSON.stringify(bad, null, 2));
  expect(bad, label).toEqual([]);
}

// ── tests ─────────────────────────────────────────────────────────────────────

test("FLEX space-evenly matches CSS", async ({ page }) => {
  const children = [
    { basis: 0.2, cross: 0.3 },
    { basis: 0.2, cross: 0.3 },
    { basis: 0.2, cross: 0.3 },
  ];
  await assertFlexParity(page, "space-evenly", { justify: "space-evenly", children });
});

test("FLEX baseline aliases flex-start (equal-height boxes) matches CSS", async ({ page }) => {
  // For equal-height boxes with no text, CSS baseline == flex-start, which is
  // exactly what the engine computes (baseline → start, DR-047).
  const children = [
    { basis: 0.2, cross: 0.3 },
    { basis: 0.2, cross: 0.3 },
  ];
  await assertFlexParity(page, "baseline=start", { align: "baseline", children });
});

test("FLEX wrap × align-content matches CSS", async ({ page }) => {
  // 4 children of basis 0.4 → 2 lines of 2 (available 1).
  const children = [
    { basis: 0.4, cross: 0.2 },
    { basis: 0.4, cross: 0.2 },
    { basis: 0.4, cross: 0.2 },
    { basis: 0.4, cross: 0.2 },
  ];
  for (const alignContent of [
    "start",
    "center",
    "end",
    "space-between",
    "space-around",
    "space-evenly",
  ] as const) {
    await assertFlexParity(page, `wrap/${alignContent}`, { wrap: "wrap", alignContent, children });
  }
  // align-content stretch (children stretch to the grown line height).
  await assertFlexParity(page, "wrap/stretch", {
    wrap: "wrap",
    align: "stretch",
    alignContent: "stretch",
    children,
  });
});

test("GRID minmax tracks match CSS", async ({ page }) => {
  // minmax(0.2, 1fr) | 1fr, 2 rows fr. Small children fit cells; compare cell rects.
  const columns: Track[] = [
    { kind: "minmax", min: { kind: "ratio", value: 0.2 }, max: { kind: "fr", value: 1 } },
    { kind: "fr", value: 1 },
  ];
  const rows: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const children: GridChildIn[] = [];
  for (let r = 1; r <= 2; r += 1)
    for (let cc = 1; cc <= 2; cc += 1) children.push({ column: cc, row: r, w: 0.1, h: 0.1 });
  await assertGridParity(page, "minmax", {
    columns,
    rows,
    justify: "stretch",
    align: "stretch",
    children,
  });
});

test("GRID repeat(auto-fill) matches CSS", async ({ page }) => {
  // 0.25 ratio repeat → 4 columns; 1 row. Children in cols 1..4.
  const children: GridChildIn[] = [1, 2, 3, 4].map((cc) => ({
    column: cc,
    row: 1,
    w: 0.1,
    h: 0.1,
  }));
  await assertGridParity(page, "auto-fill", {
    columnsRepeat: { mode: "auto-fill", track: { kind: "ratio", value: 0.25 } },
    rows: [{ kind: "fr", value: 1 }],
    justify: "stretch",
    align: "stretch",
    children,
  });
});

test("GRID repeat(auto-fit) with all cells filled matches CSS", async ({ page }) => {
  const children: GridChildIn[] = [1, 2, 3, 4].map((cc) => ({
    column: cc,
    row: 1,
    w: 0.1,
    h: 0.1,
  }));
  await assertGridParity(page, "auto-fit", {
    columnsRepeat: { mode: "auto-fit", track: { kind: "ratio", value: 0.25 } },
    rows: [{ kind: "fr", value: 1 }],
    justify: "stretch",
    align: "stretch",
    children,
  });
});

test("GRID grid-template-areas matches CSS", async ({ page }) => {
  // 2×2 areas: header spans top row; nav / main on the bottom row.
  const children: GridChildIn[] = [
    { column: 1, row: 1, w: 0.1, h: 0.1, area: "header" },
    { column: 1, row: 1, w: 0.1, h: 0.1, area: "nav" },
    { column: 1, row: 1, w: 0.1, h: 0.1, area: "main" },
  ];
  await assertGridParity(page, "areas", {
    columns: [
      { kind: "fr", value: 1 },
      { kind: "fr", value: 1 },
    ],
    rows: [
      { kind: "fr", value: 1 },
      { kind: "fr", value: 1 },
    ],
    areas: ["header header", "nav main"],
    justify: "stretch",
    align: "stretch",
    children,
  });
});

test("GRID dense backfill matches CSS grid-auto-flow: row dense", async ({ page }) => {
  // 3 columns × 2 rows. A wide (span-2) item explicitly on row 2 col 1; three
  // 1×1 auto items. Dense backfills row 1 left-to-right. Compare to CSS where
  // the auto items carry no placement and the wide item uses grid-row/column.
  const columns: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const rows: Track[] = [
    { kind: "fr", value: 1 },
    { kind: "fr", value: 1 },
  ];
  const engInput: GridInput = {
    columns,
    rows,
    justify: "stretch",
    align: "stretch",
    children: [
      { column: 1, row: 2, columnSpan: 2, w: 0.1, h: 0.1 }, // explicit wide block
      { column: 1, row: 1, w: 0.1, h: 0.1 },
      { column: 1, row: 1, w: 0.1, h: 0.1 },
      { column: 1, row: 1, w: 0.1, h: 0.1 },
    ],
  };
  const eng = engineGrid(engInput);
  // CSS: same grid, grid-auto-flow: row dense; wide item placed explicitly, the
  // three others auto-flow (no grid-column/row).
  const css = await page.evaluate(
    ({ SIZE }) => {
      const host = document.getElementById("host")!;
      host.innerHTML = "";
      const c = document.createElement("div");
      c.style.cssText = [
        "position:absolute;left:0;top:0;box-sizing:border-box;border:0;margin:0",
        `width:${SIZE}px;height:${SIZE}px;display:grid`,
        "grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr",
        "grid-auto-flow:row dense;justify-items:stretch;align-items:stretch",
      ].join(";");
      const wide = document.createElement("div");
      wide.style.cssText = "grid-column:1 / span 2;grid-row:2;width:auto;height:auto";
      c.appendChild(wide);
      for (let i = 0; i < 3; i += 1) {
        const el = document.createElement("div");
        el.style.cssText = "width:auto;height:auto";
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
    { SIZE },
  );
  // engine order: [wide, a, b, c]; CSS DOM order: [wide, auto0, auto1, auto2].
  const bad: unknown[] = [];
  for (let i = 0; i < 4; i += 1)
    if (!matches(eng[i], css[i]!)) bad.push({ i, engine: eng[i], css: css[i] });
  if (bad.length) console.log("GRID-EXT dense:", JSON.stringify(bad, null, 2));
  expect(bad).toEqual([]);
});
