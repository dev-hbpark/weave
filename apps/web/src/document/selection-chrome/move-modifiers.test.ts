// WI-183 — move modifiers: Shift axis lock (minor axis zeroed BEFORE snap),
// Alt drag-duplicate (once, at begin, with the full moving set).

import type { ItemId } from "@agocraft/core";
import type { FrameMoveSnap } from "@agocraft/editor";
import { describe, expect, it } from "vitest";
import type { LiveModifiers } from "./modifier-tracker.js";
import { withMoveModifiers } from "./move-modifiers.js";

const mods = (over: Partial<LiveModifiers>): LiveModifiers => ({
  shift: false,
  alt: false,
  meta: false,
  ctrl: false,
  ...over,
});

function recordingInner() {
  const calls: { begin: string[][]; deltas: Array<{ dx: number; dy: number }>; ends: number } = {
    begin: [],
    deltas: [],
    ends: 0,
  };
  const inner: FrameMoveSnap = {
    begin: (_p, ids) => {
      calls.begin.push(ids.map(String));
    },
    snapDelta: (dx, dy) => {
      calls.deltas.push({ dx, dy });
      return { dx, dy };
    },
    end: () => {
      calls.ends += 1;
    },
  };
  return { inner, calls };
}

describe("withMoveModifiers — Shift axis lock", () => {
  it("zeroes the minor axis before the inner snap sees the delta", () => {
    const { inner, calls } = recordingInner();
    const snap = withMoveModifiers(inner, {
      modifiers: () => mods({ shift: true }),
      duplicateInPlace: () => {},
    });
    snap.snapDelta(10, 3);
    snap.snapDelta(-2, 9);
    expect(calls.deltas).toEqual([
      { dx: 10, dy: 0 },
      { dx: 0, dy: 9 },
    ]);
  });

  it("re-evaluates the dominant axis live (lock can flip mid-drag)", () => {
    const { inner, calls } = recordingInner();
    let shift = true;
    const snap = withMoveModifiers(inner, {
      modifiers: () => mods({ shift }),
      duplicateInPlace: () => {},
    });
    snap.snapDelta(10, 3); // x dominant
    snap.snapDelta(4, 12); // y dominant — same gesture
    shift = false;
    snap.snapDelta(5, 5); // released → raw passthrough
    expect(calls.deltas).toEqual([
      { dx: 10, dy: 0 },
      { dx: 0, dy: 12 },
      { dx: 5, dy: 5 },
    ]);
  });
});

describe("withMoveModifiers — Alt drag-duplicate", () => {
  it("duplicates the moving set in place once, at begin", () => {
    const { inner, calls } = recordingInner();
    const duplicated: string[][] = [];
    const snap = withMoveModifiers(inner, {
      modifiers: () => mods({ alt: true }),
      duplicateInPlace: (ids) => duplicated.push([...ids]),
    });
    snap.begin("a" as ItemId, ["a", "b"] as unknown as ReadonlyArray<ItemId>);
    snap.snapDelta(5, 5);
    snap.end();
    expect(duplicated).toEqual([["a", "b"]]);
    expect(calls.begin).toEqual([["a", "b"]]); // inner begin still ran
    expect(calls.ends).toBe(1);
  });

  it("no Alt at the threshold → no duplicate (mid-drag Alt is ignored)", () => {
    const { inner } = recordingInner();
    let alt = false;
    const duplicated: string[][] = [];
    const snap = withMoveModifiers(inner, {
      modifiers: () => mods({ alt }),
      duplicateInPlace: (ids) => duplicated.push([...ids]),
    });
    snap.begin("a" as ItemId, ["a"] as unknown as ReadonlyArray<ItemId>);
    alt = true; // pressed after the threshold
    snap.snapDelta(5, 5);
    expect(duplicated).toEqual([]);
  });
});
