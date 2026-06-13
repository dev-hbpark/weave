// 아쿠 — agent text-box sizing (DR-098: agent-added text → Fixed box). Pure transform.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { fixAgentTextBox } from "./agent-text-resize.js";

const frame = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
});

// root(free) → freeFrame(absolute-constraints), flexFrame(auto-flex).
function makeDoc(): AgocraftDocument {
  const freeFrame = {
    id: "freeFrame",
    kind: "frame",
    attrs: { frame: frame(0, 0, 0.5, 0.5), layout: { kind: "absolute-constraints" } },
    children: [],
  };
  const flexFrame = {
    id: "flexFrame",
    kind: "frame",
    attrs: { frame: frame(0.5, 0, 0.5, 0.5), layout: { kind: "auto-flex", direction: "column" } },
    children: [],
  };
  const flexRowFrame = {
    id: "flexRowFrame",
    kind: "frame",
    attrs: { frame: frame(0, 0, 1, 0.3), layout: { kind: "auto-flex", direction: "row" } },
    children: [],
  };
  const gridFrame = {
    id: "gridFrame",
    kind: "frame",
    attrs: { frame: frame(0, 0, 1, 0.3), layout: { kind: "auto-grid", columns: [], rows: [] } },
    children: [],
  };
  const plainFrame = {
    id: "plainFrame",
    kind: "frame",
    attrs: { frame: frame(0, 0.5, 1, 0.5) }, // no layout → free placement
    children: [],
  };
  return {
    root: {
      id: "root",
      kind: "frame",
      attrs: {},
      children: [freeFrame, flexFrame, flexRowFrame, gridFrame, plainFrame],
    },
  } as unknown as AgocraftDocument;
}

const FIXED = {
  kind: "absolute-constraints",
  anchor: { horizontal: "left", vertical: "top" },
};

const FLEX_SHARE = { kind: "auto-flex", grow: 1, shrink: 1, basis: 0 };

// biome-ignore lint/suspicious/noExplicitAny: test reads attrsOverride off an open bag
const ov = (out: unknown): any => (out as any).attrsOverride;

describe("fixAgentTextBox", () => {
  it("injects the Fixed layoutChild for text added into the root (free)", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "text", attrsOverride: { text: "hi" } },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FIXED);
    expect(ov(out).text).toBe("hi");
  });

  it("injects Fixed for an absolute-constraints frame parent", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "text", containerId: "freeFrame", attrsOverride: {} },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FIXED);
  });

  it("injects Fixed for a frame with no layout (free placement)", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "text", containerId: "plainFrame" },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FIXED);
  });

  it("stamps alignSelf:stretch for text added into a flex COLUMN (WI-215 — bind width, keep auto-height)", () => {
    // The default column `align` is "start" (not "stretch"), so an unstretched
    // column-text's WIDTH collapses to its seed → a 1-glyph vertical ribbon.
    // alignSelf:"stretch" binds the width to the column (text wraps) while
    // grow:0 + basis:"auto" keep the HEIGHT following content.
    const input = { kind: "text", containerId: "flexFrame", attrsOverride: { text: "hi" } };
    const out = fixAgentTextBox("weave.item.add", input, makeDoc());
    expect(ov(out).layoutChild).toEqual({
      kind: "auto-flex",
      grow: 0,
      shrink: 1,
      basis: "auto",
      alignSelf: "stretch",
    });
    expect(ov(out).text).toBe("hi");
  });

  it("leaves grid text with NO layoutChild alone (grid auto-places + stretches by default)", () => {
    const input = { kind: "text", containerId: "gridFrame", attrsOverride: { text: "hi" } };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("MERGES justifySelf:stretch into grid text that has cell placement but no justifySelf (WI-215)", () => {
    // Live repro: grid justify:'center' + text layoutChild {col,row} without
    // justifySelf → the cell sizes from sizeW (0 for auto-height text) → sliver.
    // We add the width-binding the agent omitted, KEEPING its column/row.
    const input = {
      kind: "text",
      containerId: "gridFrame",
      attrsOverride: {
        text: "프레임워크 코어 격리",
        layoutChild: { kind: "auto-grid", column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
      },
    };
    const out = fixAgentTextBox("weave.item.add", input, makeDoc());
    expect(ov(out).layoutChild).toEqual({
      kind: "auto-grid",
      column: 2,
      row: 1,
      columnSpan: 1,
      rowSpan: 1,
      justifySelf: "stretch",
    });
    expect(ov(out).text).toBe("프레임워크 코어 격리");
  });

  it("RESPECTS an explicit justifySelf the agent chose for grid text (no override)", () => {
    const input = {
      kind: "text",
      containerId: "gridFrame",
      attrsOverride: {
        text: "x",
        layoutChild: {
          kind: "auto-grid",
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          justifySelf: "center",
        },
      },
    };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("MERGES alignSelf:stretch into flex-COLUMN text that has a policy but no alignSelf", () => {
    const input = {
      kind: "text",
      containerId: "flexFrame",
      attrsOverride: {
        text: "hi",
        layoutChild: { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" },
      },
    };
    const out = fixAgentTextBox("weave.item.add", input, makeDoc());
    expect(ov(out).layoutChild).toEqual({
      kind: "auto-flex",
      grow: 0,
      shrink: 1,
      basis: "auto",
      alignSelf: "stretch",
    });
  });

  it("injects CSS-flex:1 share for text added into an auto-flex ROW (WI-149/DR-104)", () => {
    // basis:0 grow:1 → never over-fills, shares the row; prevents the engine
    // freezing the full-width seed as basis and ratcheting siblings to a sliver.
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "text", containerId: "flexRowFrame", attrsOverride: { text: "01" } },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FLEX_SHARE);
    expect(ov(out).text).toBe("01");
  });

  it("respects an explicit flex policy the agent set for a ROW child (same reference)", () => {
    const input = {
      kind: "text",
      containerId: "flexRowFrame",
      attrsOverride: { layoutChild: { kind: "auto-flex", grow: 0, shrink: 0, basis: 0.2 } },
    };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  // WI-149 round 3 — non-text (frame/shape) over-fill on the main axis.
  it("injects flex:1 share for a FRAME added into a flex ROW with no frame (would inherit full width)", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "frame", containerId: "flexRowFrame" },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FLEX_SHARE);
  });

  it("injects flex:1 share for a FRAME added into a flex COLUMN with no frame (would inherit full height)", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "shape", containerId: "flexFrame" }, // flexFrame is a column
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FLEX_SHARE);
  });

  it("respects an explicit main-axis size on a non-text add (e.g. qr width 0.1 in a ROW)", () => {
    const input = { kind: "qr", containerId: "flexRowFrame", frame: { width: 0.1, height: 0.1 } };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("does NOT touch a non-text item added into an auto-grid (the track owns the cell)", () => {
    const input = { kind: "frame", containerId: "gridFrame" };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("does NOT touch a non-text item added into free placement (keeps its own frame)", () => {
    const input = { kind: "shape", containerId: "plainFrame" };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("respects an explicit layoutChild the agent set (same reference)", () => {
    const input = {
      kind: "text",
      attrsOverride: {
        layoutChild: {
          kind: "absolute-constraints",
          anchor: { horizontal: "scale", vertical: "scale" },
        },
      },
    };
    expect(fixAgentTextBox("weave.item.add", input, makeDoc())).toBe(input);
  });

  it("ignores non-text adds and non-add commands (same reference)", () => {
    const shape = { kind: "shape", attrsOverride: {} };
    expect(fixAgentTextBox("weave.item.add", shape, makeDoc())).toBe(shape);
    const upd = { itemId: "x", attrs: {} };
    expect(fixAgentTextBox("weave.item.update", upd, makeDoc())).toBe(upd);
  });

  it("unknown container id → treated as free (inject)", () => {
    const out = fixAgentTextBox(
      "weave.item.add",
      { kind: "text", containerId: "ghost" },
      makeDoc(),
    );
    expect(ov(out).layoutChild).toEqual(FIXED);
  });
});
