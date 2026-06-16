// WI-240 Phase 2 — publishing Decorator + full wire round-trip (presenter →
// encode → decode → dispatch → viewer map), no socket.

import { describe, expect, it, vi } from "vitest";
import type { InkStroke, InkSurfaceKey } from "../types.js";
import type { InkSession } from "../use-ink-session.js";
import { createPublishingSession } from "./publishing-session.js";
import {
  decodeSessionMessage,
  dispatchSessionMessage,
  encodeSessionMessage,
  type SessionMessage,
} from "./session-message.js";

function stroke(id: string): InkStroke {
  return {
    id,
    toolId: "pen",
    style: { color: "#000", width: 4, opacity: 1, blend: "normal" },
    points: [{ x: 0, y: 0 }],
  };
}

/** A real-enough in-memory InkSession for the decorator to wrap. */
function memSession(): InkSession & { dump(s: string): readonly InkStroke[] } {
  const map = new Map<string, InkStroke[]>();
  return {
    strokes: (s) => map.get(s) ?? [],
    addStroke: (s, st) => map.set(s, [...(map.get(s) ?? []), st]),
    eraseAt: (s) => map.set(s, []),
    clear: (s) => map.set(s, []),
    undo: () => {},
    redo: () => {},
    canUndo: true,
    canRedo: false,
    dump: (s) => map.get(s) ?? [],
  };
}

describe("createPublishingSession (Decorator)", () => {
  it("writes through to the base AND publishes the right messages", () => {
    const base = memSession();
    const published: SessionMessage[] = [];
    const pub = createPublishingSession(base, (m) => published.push(m));

    pub.addStroke("slide:a", stroke("1"));
    expect(base.dump("slide:a")).toHaveLength(1); // wrote through
    expect(published[0]).toEqual({ t: "stroke", surface: "slide:a", stroke: stroke("1") });

    pub.clear("slide:a");
    expect(base.dump("slide:a")).toHaveLength(0);
    expect(published[1]).toEqual({ t: "sync", surface: "slide:a", strokes: [] });
  });

  it("undo re-syncs every touched surface", () => {
    const base = memSession();
    const published: SessionMessage[] = [];
    const pub = createPublishingSession(base, (m) => published.push(m));
    pub.addStroke("slide:a", stroke("1"));
    pub.addStroke("slide:b", stroke("2"));
    published.length = 0;
    pub.undo();
    const synced = published
      .filter((m) => m.t === "sync")
      .map((m) => (m as { surface: string }).surface);
    expect(new Set(synced)).toEqual(new Set(["slide:a", "slide:b"]));
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
      onSync: (s: InkSurfaceKey, sts: readonly InkStroke[]) => viewer.set(s, sts),
      onStep: vi.fn(),
    };
    const pub = createPublishingSession(base, (m) => {
      const decoded = decodeSessionMessage(encodeSessionMessage(m));
      if (decoded !== null) dispatchSessionMessage(decoded, handlers);
    });

    pub.addStroke("slide:a", stroke("1"));
    pub.addStroke("slide:a", stroke("2"));
    expect(viewer.get("slide:a")).toHaveLength(2); // presenter strokes reached the viewer

    pub.clear("slide:a"); // sync → viewer surface replaced with []
    expect(viewer.get("slide:a")).toEqual([]);
  });
});
