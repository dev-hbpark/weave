// WI-240 Phase 2 — publishing Decorator + full wire round-trip (presenter →
// encode → decode → dispatch → viewer map), no socket.

import { describe, expect, it, vi } from "vitest";
import { strokeHitsPoint } from "../ink-session.js";
import type { InkPoint, InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";
import { createPublishingSession } from "./publishing-session.js";
import {
  decodeSessionMessage,
  dispatchSessionMessage,
  encodeSessionMessage,
  type SessionMessage,
} from "./session-message.js";

function stroke(id: string, x = 0, y = 0): InkStroke {
  return {
    id,
    toolId: "pen",
    style: { color: "#000", width: 4, opacity: 1, blend: "normal" },
    points: [{ x, y }],
  };
}

/** An in-memory InkSession for the decorator to wrap. NOTE: the decorator must
 *  publish from the mutation ARGS, never a read-back of `strokes()` — so this
 *  fake's `strokes` is deliberately not consulted by the publish path. */
function memSession(): InkSession & { dump(s: string): readonly InkStroke[] } {
  const map = new Map<string, InkStroke[]>();
  return {
    strokes: (s) => map.get(s) ?? [],
    addStroke: (s, st) => map.set(s, [...(map.get(s) ?? []), st]),
    eraseAt: (s, at) =>
      map.set(
        s,
        (map.get(s) ?? []).filter((k) => !strokeHitsPoint(k, at)),
      ),
    clear: (s) => map.set(s, []),
    undo: () => {},
    redo: () => {},
    canUndo: true,
    canRedo: false,
    dump: (s) => map.get(s) ?? [],
  };
}

describe("createPublishingSession (Decorator)", () => {
  it("writes through to the base AND publishes a message derived from the args", () => {
    const base = memSession();
    const published: SessionMessage[] = [];
    const pub = createPublishingSession(base, (m) => published.push(m));

    pub.addStroke("slide:a", stroke("1"));
    expect(base.dump("slide:a")).toHaveLength(1);
    expect(published[0]).toEqual({ t: "stroke", surface: "slide:a", stroke: stroke("1") });

    pub.eraseAt("slide:a", { x: 7, y: 8 });
    expect(published[1]).toEqual({ t: "erase", surface: "slide:a", at: { x: 7, y: 8 } });

    pub.clear("slide:a");
    expect(base.dump("slide:a")).toHaveLength(0);
    expect(published[2]).toEqual({ t: "clear", surface: "slide:a" });
  });

  it("undo/redo write through to the base but are NOT broadcast (v1 local-only)", () => {
    const base = memSession();
    const published: SessionMessage[] = [];
    const undo = vi.fn();
    const redo = vi.fn();
    const pub = createPublishingSession({ ...base, undo, redo }, (m) => published.push(m));
    pub.undo();
    pub.redo();
    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
    expect(published).toEqual([]); // nothing broadcast
  });

  it("delegates canUndo/canRedo to the base", () => {
    const pub = createPublishingSession(memSession(), vi.fn());
    expect(pub.canUndo).toBe(true);
    expect(pub.canRedo).toBe(false);
  });
});

describe("full wire round-trip (presenter → viewer), no socket", () => {
  it("a viewer map converges with the presenter via encode/decode/dispatch", () => {
    const base = memSession();
    // The "wire": publish → encode → (network) → decode → dispatch → viewer map.
    const viewer = new Map<InkSurfaceKey, readonly InkStroke[]>();
    const handlers = {
      onStroke: (s: InkSurfaceKey, st: InkStroke) => viewer.set(s, [...(viewer.get(s) ?? []), st]),
      onErase: (s: InkSurfaceKey, at: InkPoint) =>
        viewer.set(
          s,
          (viewer.get(s) ?? []).filter((k) => !strokeHitsPoint(k, at)),
        ),
      onClear: (s: InkSurfaceKey) => viewer.set(s, []),
      onStep: vi.fn(),
    };
    const pub = createPublishingSession(base, (m) => {
      const decoded = decodeSessionMessage(encodeSessionMessage(m));
      if (decoded !== null) dispatchSessionMessage(decoded, handlers);
    });

    pub.addStroke("slide:a", stroke("1", 10, 10));
    pub.addStroke("slide:a", stroke("2", 50, 50));
    expect(viewer.get("slide:a")).toHaveLength(2); // strokes reached the viewer

    pub.eraseAt("slide:a", { x: 10, y: 10 }); // erase point hits stroke "1"
    expect(viewer.get("slide:a")?.map((s) => s.id)).toEqual(["2"]); // viewer ran same hit test

    pub.clear("slide:a");
    expect(viewer.get("slide:a")).toEqual([]); // clear propagated
  });
});
