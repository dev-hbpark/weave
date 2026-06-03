import type { LayoutChildPolicy } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { deriveTextAutoResize, layoutChildFromTextAutoResize } from "./derive-text-auto-resize.js";

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
});
