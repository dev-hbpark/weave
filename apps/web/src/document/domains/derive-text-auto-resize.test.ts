import type { LayoutChildPolicy, LayoutSpec } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import {
  deriveTextAutoResize,
  layoutChildForTextResizeMode,
  layoutChildFromTextAutoResize,
} from "./derive-text-auto-resize.js";

describe("deriveTextAutoResize", () => {
  it("undefined → HEIGHT (legacy default: auto-height, wraps to frame width)", () => {
    expect(deriveTextAutoResize(undefined)).toBe("HEIGHT");
  });

  // DR-041: a laid-out child's WIDTH is owned by the parent layout, so the text
  // must WRAP to it and auto-fit its HEIGHT. Auto-width (WIDTH_AND_HEIGHT) here
  // used to make layout-child text hug its content and overflow the cell.
  it("auto-flex child → HEIGHT (wraps to the layout-bound width, not auto-width)", () => {
    const policy: LayoutChildPolicy = { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" };
    expect(deriveTextAutoResize(policy)).toBe("HEIGHT");
  });

  it("auto-grid child → HEIGHT (wraps to the column track width)", () => {
    const policy: LayoutChildPolicy = {
      kind: "auto-grid",
      column: 1,
      columnSpan: 1,
      row: 1,
      rowSpan: 1,
    };
    expect(deriveTextAutoResize(policy)).toBe("HEIGHT");
  });

  it("absolute-constraints scale×scale → WIDTH_AND_HEIGHT (free-placement auto-width)", () => {
    const policy: LayoutChildPolicy = {
      kind: "absolute-constraints",
      anchor: { horizontal: "scale", vertical: "scale" },
    };
    expect(deriveTextAutoResize(policy)).toBe("WIDTH_AND_HEIGHT");
  });

  it("absolute-constraints scale×top → HEIGHT (auto-height)", () => {
    const policy: LayoutChildPolicy = {
      kind: "absolute-constraints",
      anchor: { horizontal: "scale", vertical: "top" },
    };
    expect(deriveTextAutoResize(policy)).toBe("HEIGHT");
  });

  it("absolute-constraints left×top → NONE (Fixed)", () => {
    const policy: LayoutChildPolicy = {
      kind: "absolute-constraints",
      anchor: { horizontal: "left", vertical: "top" },
    };
    expect(deriveTextAutoResize(policy)).toBe("NONE");
  });

  it("round-trips the absolute-constraints legacy modes via layoutChildFromTextAutoResize", () => {
    for (const mode of ["WIDTH_AND_HEIGHT", "HEIGHT", "NONE"] as const) {
      expect(deriveTextAutoResize(layoutChildFromTextAutoResize(mode))).toBe(mode);
    }
  });

  // WI-216 / DR-053 Stage 2 (c) — an EXPLICIT intrinsic cross size means "고정"
  // so the toolbar label stays sticky after a manual resize (the engine stamps
  // it). Its ABSENCE is content-auto ("자동높이").
  it("auto-flex child WITH crossSize → NONE (engine holds it — Fixed)", () => {
    const policy: LayoutChildPolicy = {
      kind: "auto-flex",
      grow: 0,
      shrink: 1,
      basis: "auto",
      crossSize: 0.3,
    };
    expect(deriveTextAutoResize(policy)).toBe("NONE");
  });

  it("auto-grid child WITH sizeH → NONE (Fixed)", () => {
    const policy: LayoutChildPolicy = {
      kind: "auto-grid",
      column: 1,
      columnSpan: 1,
      row: 1,
      rowSpan: 1,
      sizeH: 0.25,
    };
    expect(deriveTextAutoResize(policy)).toBe("NONE");
  });
});

describe("layoutChildForTextResizeMode", () => {
  const flexRow: LayoutSpec = {
    kind: "auto-flex",
    direction: "row",
    gap: 0,
    justify: "start",
    align: "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const flexCol: LayoutSpec = { ...flexRow, direction: "column" };
  const grid: LayoutSpec = {
    kind: "auto-grid",
    columns: [],
    rows: [],
    columnGap: 0,
    rowGap: 0,
    justify: "start",
    align: "start",
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const flexChild: LayoutChildPolicy = { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" };
  const gridChild: LayoutChildPolicy = {
    kind: "auto-grid",
    column: 1,
    columnSpan: 1,
    row: 1,
    rowSpan: 1,
  };
  const frame = { width: 0.5, height: 0.4 };

  it("flex-row NONE stamps crossSize = frame.height and keeps the policy", () => {
    const r = layoutChildForTextResizeMode("NONE", flexChild, flexRow, frame);
    expect(r).toEqual({ kind: "auto-flex", grow: 0, shrink: 1, basis: "auto", crossSize: 0.4 });
  });

  it("flex-row HEIGHT clears crossSize (content-auto)", () => {
    const fixed: LayoutChildPolicy = { ...flexChild, crossSize: 0.4 };
    const r = layoutChildForTextResizeMode("HEIGHT", fixed, flexRow, frame);
    expect(r).toEqual({ kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" });
  });

  it("flex-row WIDTH_AND_HEIGHT hugs the main axis (basis auto) and frees the cross", () => {
    const wide: LayoutChildPolicy = { ...flexChild, basis: 0.5, crossSize: 0.4 };
    const r = layoutChildForTextResizeMode("WIDTH_AND_HEIGHT", wide, flexRow, frame);
    expect(r).toEqual({ kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" });
  });

  it("flex-column NONE stamps crossSize = frame.width (cross = width in a column)", () => {
    const r = layoutChildForTextResizeMode("NONE", flexChild, flexCol, frame);
    expect(r).toEqual({ kind: "auto-flex", grow: 0, shrink: 1, basis: "auto", crossSize: 0.5 });
  });

  it("preserves alignSelf:stretch (FILL) untouched on a NONE write", () => {
    const filled: LayoutChildPolicy = { ...flexChild, alignSelf: "stretch" };
    const r = layoutChildForTextResizeMode("NONE", filled, flexRow, frame);
    expect(r).toMatchObject({ alignSelf: "stretch", crossSize: 0.4 });
  });

  it("grid NONE stamps sizeW + sizeH (fixed cell)", () => {
    const r = layoutChildForTextResizeMode("NONE", gridChild, grid, frame);
    expect(r).toMatchObject({ sizeW: 0.5, sizeH: 0.4 });
  });

  it("grid HEIGHT clears sizeH but keeps an explicit sizeW", () => {
    const sized: LayoutChildPolicy = { ...gridChild, sizeW: 0.5, sizeH: 0.4 };
    const r = layoutChildForTextResizeMode("HEIGHT", sized, grid, frame);
    expect(r).toMatchObject({ sizeW: 0.5 });
    expect((r as { sizeH?: number }).sizeH).toBeUndefined();
  });

  it("free / absolute parent falls back to the legacy anchor mapping", () => {
    const r = layoutChildForTextResizeMode("NONE", undefined, undefined, frame);
    expect(r).toEqual({
      kind: "absolute-constraints",
      anchor: { horizontal: "left", vertical: "top" },
    });
  });
});
