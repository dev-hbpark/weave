// WI-239 Phase 1 — pure ink store unit tests (no DOM).

import { describe, expect, it } from "vitest";
import { canRedo, canUndo, initialInkState, inkReducer, strokesOf } from "./ink-session.js";
import type { InkStroke } from "./types.js";

function stroke(id: string, pts: Array<[number, number]>, width = 4): InkStroke {
  return {
    id,
    toolId: "pen",
    style: { color: "#ef4444", width, opacity: 1, blend: "normal" },
    points: pts.map(([x, y]) => ({ x, y })),
  };
}

describe("inkReducer", () => {
  it("adds strokes per surface independently", () => {
    let s = initialInkState();
    s = inkReducer(s, { type: "add", surface: "slide:a", stroke: stroke("1", [[0, 0]]) });
    s = inkReducer(s, { type: "add", surface: "slide:b", stroke: stroke("2", [[1, 1]]) });
    expect(strokesOf(s, "slide:a")).toHaveLength(1);
    expect(strokesOf(s, "slide:b")).toHaveLength(1);
    expect(strokesOf(s, "slide:c")).toHaveLength(0);
  });

  it("erases a stroke when the point hits within tolerance, ignores misses", () => {
    let s = initialInkState();
    s = inkReducer(s, {
      type: "add",
      surface: "k",
      stroke: stroke("1", [
        [10, 10],
        [20, 20],
      ]),
    });
    // Miss — far away, no history entry, same reference back.
    const beforeMiss = s;
    s = inkReducer(s, { type: "erase", surface: "k", at: { x: 200, y: 200 } });
    expect(s).toBe(beforeMiss);
    // Hit — near the segment.
    s = inkReducer(s, { type: "erase", surface: "k", at: { x: 15, y: 15 } });
    expect(strokesOf(s, "k")).toHaveLength(0);
  });

  it("undo/redo walks the global history", () => {
    let s = initialInkState();
    expect(canUndo(s)).toBe(false);
    s = inkReducer(s, { type: "add", surface: "k", stroke: stroke("1", [[0, 0]]) });
    s = inkReducer(s, { type: "add", surface: "k", stroke: stroke("2", [[1, 1]]) });
    expect(strokesOf(s, "k")).toHaveLength(2);
    expect(canUndo(s)).toBe(true);

    s = inkReducer(s, { type: "undo" });
    expect(strokesOf(s, "k")).toHaveLength(1);
    expect(canRedo(s)).toBe(true);

    s = inkReducer(s, { type: "redo" });
    expect(strokesOf(s, "k")).toHaveLength(2);
  });

  it("a new stroke after undo drops the redo branch", () => {
    let s = initialInkState();
    s = inkReducer(s, { type: "add", surface: "k", stroke: stroke("1", [[0, 0]]) });
    s = inkReducer(s, { type: "undo" });
    expect(canRedo(s)).toBe(true);
    s = inkReducer(s, { type: "add", surface: "k", stroke: stroke("2", [[5, 5]]) });
    expect(canRedo(s)).toBe(false);
    expect(strokesOf(s, "k")).toHaveLength(1);
    expect(strokesOf(s, "k")[0]?.id).toBe("2");
  });

  it("clear empties a surface and is undoable; clearing an empty surface is a no-op", () => {
    let s = initialInkState();
    s = inkReducer(s, { type: "add", surface: "k", stroke: stroke("1", [[0, 0]]) });
    s = inkReducer(s, { type: "clear", surface: "k" });
    expect(strokesOf(s, "k")).toHaveLength(0);
    s = inkReducer(s, { type: "undo" });
    expect(strokesOf(s, "k")).toHaveLength(1);
    // No-op clear on an empty surface returns the same state reference.
    const emptyClear = inkReducer(initialInkState(), { type: "clear", surface: "x" });
    expect(emptyClear).toEqual(initialInkState());
  });

  it("erase tolerance scales with stroke width", () => {
    let s = initialInkState();
    // A thick stroke is hittable from further away than the 8px slack alone.
    s = inkReducer(s, {
      type: "add",
      surface: "k",
      stroke: stroke(
        "1",
        [
          [0, 0],
          [0, 0],
        ],
        40,
      ),
    });
    s = inkReducer(s, { type: "erase", surface: "k", at: { x: 25, y: 0 } });
    expect(strokesOf(s, "k")).toHaveLength(0);
  });
});
