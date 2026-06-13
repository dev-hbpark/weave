// 아쿠 (Aku) — WI-215 layout INVARIANT matrix.
//
// The unit tests in `agent-text-resize.test.ts` assert the *policy we stamp*.
// This file asserts the *outcome*: for the cross-product of
//   (container layout × incoming text frame × incoming layoutChild)
// we run `fixAgentTextBox` AND THEN the REAL `@agocraft/layout` adapter, and
// assert the text box does NOT collapse to a vertical sliver — i.e. its
// layout-resolved WIDTH fills the cell / cross axis instead of starving toward
// 0. This is the property a hand-written shape assertion can't guarantee, and
// it is what surfaces the cases `fixAgentTextBox` does NOT cover (documented
// below as KNOWN BOUNDARIES rather than hidden).
//
// The engine works in the parent's LOCAL ratio space (0..1). We size every test
// cell ≥ 0.3 wide so a correct fill is ≥ ~0.27 and a sliver is ~0 — the 0.1
// floor is then an unambiguous collapse detector regardless of font/metrics
// (the geometry engine has no text measurement).

import type { Document as AgocraftDocument } from "@agocraft/core";
import {
  createAbsoluteConstraintsAdapter,
  createAutoFlexAdapter,
  createAutoGridAdapter,
  createLayoutEngine,
  createLayoutRegistry,
} from "@agocraft/layout";
import { describe, expect, it } from "vitest";
import { fixAgentTextBox } from "./agent-text-resize.js";

const flexAdapter = createAutoFlexAdapter();
const gridAdapter = createAutoGridAdapter();

/** The real LayoutEngine, registered exactly like weave's registry.ts. Used by
 *  the multi-child suite to replay weave's incremental `onChildAdd` add flow —
 *  the path where the WI-149 over-fill RATCHET lived (each add freezes the seed
 *  basis, the next compounds it). */
function makeEngine() {
  const reg = createLayoutRegistry();
  reg.register(createAbsoluteConstraintsAdapter());
  reg.register(createAutoFlexAdapter());
  reg.register(createAutoGridAdapter());
  return createLayoutEngine({ registry: reg });
}

/** A sliver is ~0 wide; a filled cell here is ≥ 0.3. 0.1 cleanly separates them. */
const COLLAPSE_FLOOR = 0.1;
const UNIT = { x: 0, y: 0, width: 1, height: 1, rotation: 0 } as const;

// ── container layouts under test (the "layer properties") ─────────────────
type FlexAlign = "start" | "center" | "end" | "stretch";
type GridJustify = "start" | "center" | "end" | "stretch";

function flexRow(align: FlexAlign) {
  return {
    kind: "auto-flex",
    direction: "row",
    gap: 0,
    justify: "start",
    align,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: "nowrap",
  } as const;
}
function flexCol(align: FlexAlign) {
  return {
    kind: "auto-flex",
    direction: "column",
    gap: 0,
    justify: "start",
    align,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    wrap: "nowrap",
  } as const;
}
// Two equal 0.5 columns × one row — every cell is 0.5 wide.
function grid(justify: GridJustify) {
  return {
    kind: "auto-grid",
    columns: [
      { kind: "ratio", value: 0.5 },
      { kind: "ratio", value: 0.5 },
    ],
    rows: [{ kind: "ratio", value: 1 }],
    columnGap: 0,
    rowGap: 0,
    justify,
    align: justify,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  } as const;
}

// ── incoming-item frame variants (the "incoming item properties") ─────────
const FRAMES: Record<string, { width: number; height: number } | undefined> = {
  "no-frame": undefined, // weave's text seed is FULL_FRAME (w 1)
  "width-0": { width: 0, height: 0.2 }, // the GPT/agent bug input
  tiny: { width: 0.0001, height: 0.2 },
  normal: { width: 0.3, height: 0.2 },
};

// ── helpers ───────────────────────────────────────────────────────────────
function makeDoc(parentLayout: unknown): AgocraftDocument {
  const parent = {
    id: "P",
    kind: "frame",
    attrs: { frame: { ...UNIT }, ...(parentLayout !== undefined ? { layout: parentLayout } : {}) },
    children: [],
  };
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: [parent] },
  } as unknown as AgocraftDocument;
}

/** Run fixAgentTextBox on an agent text add, returning the stamped layoutChild. */
function stamp(
  doc: AgocraftDocument,
  frame: { width: number; height: number } | undefined,
  existingLayoutChild: unknown,
): unknown {
  const input: Record<string, unknown> = { kind: "text", containerId: "P", attrsOverride: {} };
  if (frame !== undefined) input.frame = { x: 0, y: 0, ...frame, rotation: 0 };
  if (existingLayoutChild !== undefined) {
    input.attrsOverride = { layoutChild: existingLayoutChild };
  }
  const out = fixAgentTextBox("weave.item.add", input, doc) as {
    attrsOverride?: { layoutChild?: unknown };
  };
  return out.attrsOverride?.layoutChild;
}

/** Resolve a single text child through the real adapter; return its width. */
function resolveWidth(
  kind: "flex" | "grid",
  spec: unknown,
  policy: unknown,
  currentFrame: { width: number; height: number },
): number {
  const child = {
    itemId: "T",
    currentFrame: { x: 0, y: 0, ...currentFrame, rotation: 0 },
    policy,
  };
  const ctx = { parentSpec: spec, parentOldRatio: UNIT, parentNewRatio: UNIT };
  const adapter = kind === "flex" ? flexAdapter : gridAdapter;
  // biome-ignore lint/suspicious/noExplicitAny: adapter ctx/child are structural
  const patches = adapter.onParentResize(ctx as any, [child as any]);
  const p = patches.find((q) => q.itemId === "T");
  return p?.newFrame.width ?? currentFrame.width;
}

const SEED = { width: 1, height: 1 }; // FULL_FRAME text seed (no-frame add)

describe("WI-215 layout invariant matrix — agent text never collapses to a sliver", () => {
  // FREE placement: layout does not own width → assert the Fixed-box policy.
  describe("free placement → Fixed box policy (DR-098)", () => {
    for (const [frameName, frame] of Object.entries(FRAMES)) {
      it(`absolute-constraints parent, frame=${frameName} → absolute-constraints policy`, () => {
        const doc = makeDoc({ kind: "absolute-constraints" });
        const lc = stamp(doc, frame, undefined) as { kind?: string } | undefined;
        expect(lc?.kind).toBe("absolute-constraints");
      });
    }
  });

  // FLEX COLUMN: width = cross axis. alignSelf:stretch must fill it for EVERY
  // parent align and EVERY incoming frame/policy.
  describe("flex COLUMN → width fills the cross axis", () => {
    const aligns: FlexAlign[] = ["start", "center", "end", "stretch"];
    const policies = [undefined, { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" }];
    for (const align of aligns)
      for (const [frameName, frame] of Object.entries(FRAMES))
        for (const lc0 of policies) {
          it(`align=${align}, frame=${frameName}, policy=${lc0 ? "set" : "none"}`, () => {
            const spec = flexCol(align);
            const doc = makeDoc(spec);
            const policy = stamp(doc, frame, lc0);
            const w = resolveWidth("flex", spec, policy, frame ?? SEED);
            expect(w).toBeGreaterThan(COLLAPSE_FLOOR);
          });
        }
  });

  // FLEX ROW: width = main axis. flex:1 (basis 0, grow 1) shares the row; a
  // single child takes the whole row.
  describe("flex ROW → width fills / shares the main axis", () => {
    const aligns: FlexAlign[] = ["start", "center", "end", "stretch"];
    for (const align of aligns)
      for (const [frameName, frame] of Object.entries(FRAMES)) {
        it(`align=${align}, frame=${frameName}, single child fills the row`, () => {
          const spec = flexRow(align);
          const doc = makeDoc(spec);
          const policy = stamp(doc, frame, undefined);
          const w = resolveWidth("flex", spec, policy, frame ?? SEED);
          expect(w).toBeGreaterThan(COLLAPSE_FLOOR);
        });
      }
  });

  // AUTO-GRID: width = column track (0.5 here). justifySelf:stretch must fill
  // the cell for EVERY parent justify when the agent set a placement policy
  // (the real-world case: layoutChild carries column/row but omits justifySelf).
  describe("auto-grid with cell placement → width fills the column track", () => {
    const justifies: GridJustify[] = ["start", "center", "end", "stretch"];
    const placement = (j: GridJustify) => ({
      kind: "auto-grid",
      column: 1,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
      // sizeW mirrors the incoming frame width (what the agent serialized);
      // for width-0 this is the collapse trigger under non-stretch justify.
      sizeW: j === "stretch" ? 0.5 : 0,
    });
    for (const j of justifies)
      for (const [frameName, frame] of Object.entries(FRAMES)) {
        it(`justify=${j}, frame=${frameName}, placement policy → fills cell`, () => {
          const spec = grid(j);
          const doc = makeDoc(spec);
          const policy = stamp(doc, frame, placement(j));
          const w = resolveWidth("grid", spec, policy, frame ?? SEED);
          expect(w).toBeGreaterThan(COLLAPSE_FLOOR);
        });
      }
  });
});

// ── the former boundary: no-policy grid text + degenerate width ───────────
// fixAgentTextBox can't stamp a `justifySelf` here (no column/row → the adapter
// can't place the cell), so it DROPS the degenerate frame instead → the child
// falls back to the FULL_FRAME seed, which a non-stretch cell clamps to the
// track width. We assert via the full add→seed→resolve path.
describe("WI-215 — no-policy grid text + width-0 + non-stretch justify no longer collapses", () => {
  for (const j of ["start", "center", "end"] as const) {
    it(`justify=${j}: degenerate frame dropped → seed fills the cell`, () => {
      const spec = grid(j);
      const doc = makeDoc(spec);
      const input = {
        kind: "text",
        containerId: "P",
        frame: { x: 0, y: 0, width: 0, height: 0.2, rotation: 0 },
        attrsOverride: {},
      };
      const out = fixAgentTextBox("weave.item.add", input, doc) as {
        frame?: unknown;
        attrsOverride?: { layoutChild?: unknown };
      };
      // The degenerate frame was dropped, so weave seeds FULL_FRAME at add time.
      expect(out.frame).toBeUndefined();
      const w = resolveWidth("grid", spec, out.attrsOverride?.layoutChild, SEED);
      expect(w).toBeGreaterThan(COLLAPSE_FLOOR);
    });
  }

  it("keeps a NON-degenerate frame width (does not over-reach)", () => {
    const doc = makeDoc(grid("center"));
    const input = {
      kind: "text",
      containerId: "P",
      frame: { x: 0, y: 0, width: 0.3, height: 0.2, rotation: 0 },
      attrsOverride: {},
    };
    const out = fixAgentTextBox("weave.item.add", input, doc) as { frame?: unknown };
    expect(out.frame).toBeDefined();
  });
});

// ── MULTI-CHILD OVER-FILL (WI-149) ────────────────────────────────────────
// Over-fill is a FLEX phenomenon: N children each seeded FULL_FRAME on the main
// axis over-fill N× → agocraft shrinks (no min-content floor) → joinPolicy
// FREEZES the shrunk basis → the NEXT add compounds it (one child stranded at a
// ~1ch sliver). We replay weave's REAL incremental flow: each add goes through
// `fixAgentTextBox` then `LayoutEngine.onChildAdd` (which runs joinPolicy +
// onParentResize), applying staged frame + sibling patches between adds — then
// assert NO child collapsed. (Grid children sit in fixed tracks → no over-fill;
// included lightly for completeness.)

interface Incoming {
  readonly frame?: { width: number; height: number };
  readonly layoutChild?: unknown;
}

interface AgoChild {
  id: string;
  kind: string;
  attrs: { frame?: { width?: number; height?: number }; layoutChild?: unknown };
  children: AgoChild[];
}

/** Replay incremental adds through fixAgentTextBox + the real LayoutEngine.
 *  Returns the final children with their resolved frames. */
function addTextsIncrementally(
  parentLayout: unknown,
  incomings: ReadonlyArray<Incoming>,
): AgoChild[] {
  const eng = makeEngine();
  const doc = makeDoc(parentLayout);
  let parent: { id: string; kind: string; attrs: Record<string, unknown>; children: AgoChild[] } = {
    id: "P",
    kind: "frame",
    attrs: { frame: { ...UNIT }, layout: parentLayout },
    children: [],
  };
  incomings.forEach((inc, i) => {
    const raw: Record<string, unknown> = {
      kind: "text",
      containerId: "P",
      attrsOverride: inc.layoutChild !== undefined ? { layoutChild: inc.layoutChild } : {},
    };
    if (inc.frame !== undefined) raw.frame = { x: 0, y: 0, ...inc.frame, rotation: 0 };
    const fixed = fixAgentTextBox("weave.item.add", raw, doc) as {
      frame?: unknown;
      attrsOverride?: { layoutChild?: unknown };
    };
    const attrs: AgoChild["attrs"] = {};
    if (fixed.frame !== undefined) attrs.frame = fixed.frame as { width?: number; height?: number };
    if (fixed.attrsOverride?.layoutChild !== undefined)
      attrs.layoutChild = fixed.attrsOverride.layoutChild;
    const newChild: AgoChild = { id: `T${i}`, kind: "text", attrs, children: [] };
    // biome-ignore lint/suspicious/noExplicitAny: engine items are structural
    const { stagedChild, siblingPatches } = eng.onChildAdd({ parent, newChild } as any);
    const byId = new Map(parent.children.map((c) => [c.id, c]));
    for (const p of siblingPatches as ReadonlyArray<{ itemId: string; after: AgoChild["attrs"] }>) {
      const c = byId.get(String(p.itemId));
      if (c !== undefined) c.attrs = p.after;
    }
    parent = {
      ...parent,
      children: [...parent.children, stagedChild as unknown as AgoChild],
    };
  });
  return parent.children;
}

/** Resolved width via frameOf semantics (no frame → FULL_FRAME = width 1). */
const widthOf = (c: AgoChild): number => c.attrs.frame?.width ?? 1;

describe("WI-215 / WI-149 multi-child over-fill — no child collapses", () => {
  const COUNTS = [2, 3, 5, 8];
  const INCOMING: Record<string, Incoming> = {
    "no-frame": {},
    "width-0": { frame: { width: 0, height: 0.2 } },
  };

  // FLEX ROW — the canonical over-fill: main axis = width, shared by flex:1.
  for (const n of COUNTS)
    for (const [name, inc] of Object.entries(INCOMING)) {
      it(`flex ROW × ${n} texts (${name}) → each shares the row, none collapses`, () => {
        const kids = addTextsIncrementally(
          flexRow("start"),
          Array.from({ length: n }, () => inc),
        );
        expect(kids).toHaveLength(n);
        const widths = kids.map(widthOf);
        // (a) SHARING actually happened: flex:1 children fill the row, so the
        // widths SUM to the full main axis (~1, no gap/padding). If the engine
        // never repositioned them they'd each be FULL_FRAME (sum = n) — this
        // catches a trivially-passing test.
        const sum = widths.reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThan(0.9);
        expect(sum).toBeLessThan(1.1);
        // (b) NO child collapsed: a ratchet strands ONE child near 0 while the
        // rest look fine, so the MIN is the real signal — each gets ~1/n.
        expect(Math.min(...widths)).toBeGreaterThan(1 / n - 0.03);
      });
    }

  // FLEX COLUMN — over-fill is on HEIGHT (main); WIDTH is the cross axis and must
  // stay filled (alignSelf:stretch) for every child regardless of count.
  for (const n of COUNTS)
    for (const [name, inc] of Object.entries(INCOMING)) {
      it(`flex COLUMN × ${n} texts (${name}) → every child fills the cross-axis width`, () => {
        const kids = addTextsIncrementally(
          flexCol("start"),
          Array.from({ length: n }, () => inc),
        );
        expect(kids).toHaveLength(n);
        for (const c of kids) expect(widthOf(c)).toBeGreaterThan(COLLAPSE_FLOOR);
      });
    }

  // AUTO-GRID — children occupy fixed cells (no over-fill), each must fill its
  // column track. 2 columns × ceil(n/2) rows; placement policy without
  // justifySelf (the real agent shape) → fixAgentTextBox merges the stretch.
  for (const n of [2, 4, 6]) {
    it(`auto-grid × ${n} texts in 2-col cells (justify=center) → each fills its track`, () => {
      const rows = Math.ceil(n / 2);
      const spec = {
        kind: "auto-grid",
        columns: [
          { kind: "ratio", value: 0.5 },
          { kind: "ratio", value: 0.5 },
        ],
        rows: Array.from({ length: rows }, () => ({ kind: "ratio", value: 1 / rows })),
        columnGap: 0,
        rowGap: 0,
        justify: "center",
        align: "center",
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      };
      const incomings: Incoming[] = Array.from({ length: n }, (_, i) => ({
        frame: { width: 0, height: 0.1 }, // the width-0 bug input
        layoutChild: {
          kind: "auto-grid",
          column: (i % 2) + 1,
          row: Math.floor(i / 2) + 1,
          columnSpan: 1,
          rowSpan: 1,
        },
      }));
      const kids = addTextsIncrementally(spec, incomings);
      expect(kids).toHaveLength(n);
      for (const c of kids) expect(widthOf(c)).toBeGreaterThan(COLLAPSE_FLOOR);
    });
  }
});
