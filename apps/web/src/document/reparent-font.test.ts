// Unit — computeRatioFontReparentUpdates (font-size kind fix). Pure math: a
// ratio font's value is re-based by the parent-height ratio so the rendered px
// (value × parentHeight) is preserved across a reparent.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { computeRatioFontReparentUpdates } from "./reparent-font.js";

// Minimal doc: root → [A(h0.25), B(h0.5)]; A has a ratio-text + a px-text.
const frame = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
});
function makeDoc(): AgocraftDocument {
  const ratioText = {
    id: "t-ratio",
    kind: "text",
    attrs: { frame: frame(0.1, 0.1, 0.8, 0.3), fontSizeSpec: { kind: "ratio", value: 0.2 } },
    children: [],
  };
  const pxText = {
    id: "t-px",
    kind: "text",
    attrs: { frame: frame(0.1, 0.5, 0.8, 0.3), fontSizeSpec: { kind: "px", value: 30 } },
    children: [],
  };
  const a = {
    id: "A",
    kind: "frame",
    attrs: { frame: frame(0.05, 0.05, 0.4, 0.25) },
    children: [ratioText, pxText],
  };
  const b = { id: "B", kind: "frame", attrs: { frame: frame(0.5, 0.05, 0.4, 0.5) }, children: [] };
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: [a, b] },
  } as unknown as AgocraftDocument;
}

describe("computeRatioFontReparentUpdates", () => {
  it("re-bases a ratio font value by oldParentH / newParentH (A 0.25 → B 0.5 ⇒ ×0.5)", () => {
    const out = computeRatioFontReparentUpdates(makeDoc(), [
      { itemId: "t-ratio", newParentId: "B" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.itemId).toBe("t-ratio");
    // 0.2 × (0.25 / 0.5) = 0.1 → 0.1 × B.height preserves the original px.
    expect(out[0]!.value).toBeCloseTo(0.1, 10);
  });

  it("ignores px-kind fonts (already absolute)", () => {
    const out = computeRatioFontReparentUpdates(makeDoc(), [{ itemId: "t-px", newParentId: "B" }]);
    expect(out).toEqual([]);
  });

  it("no update when the parent height is unchanged (same-height target)", () => {
    // Moving within A's height tier (A→A is a no-op; emulate equal height via A→A).
    const out = computeRatioFontReparentUpdates(makeDoc(), [
      { itemId: "t-ratio", newParentId: "A" },
    ]);
    expect(out).toEqual([]);
  });
});
