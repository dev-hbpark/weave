// WI-240 Phase 2 — wire protocol encode/decode/dispatch.

import { describe, expect, it, vi } from "vitest";
import type { InkStroke } from "../types.js";
import {
  decodeSessionMessage,
  dispatchSessionMessage,
  encodeSessionMessage,
  type SessionMessage,
} from "./session-message.js";

const STROKE: InkStroke = {
  id: "s1",
  toolId: "pen",
  style: { color: "#000", width: 4, opacity: 1, blend: "normal" },
  points: [{ x: 1, y: 2 }],
};

describe("session-message encode/decode", () => {
  it("round-trips each message kind", () => {
    const msgs: SessionMessage[] = [
      { t: "stroke", surface: "slide:a", stroke: STROKE },
      { t: "sync", surface: "slide:a", strokes: [STROKE] },
      { t: "step", step: 3 },
    ];
    for (const m of msgs) {
      expect(decodeSessionMessage(encodeSessionMessage(m))).toEqual(m);
    }
  });

  it("rejects malformed / unknown-tag frames", () => {
    expect(decodeSessionMessage("not json")).toBeNull();
    expect(decodeSessionMessage("123")).toBeNull();
    expect(decodeSessionMessage(JSON.stringify({ t: "nope" }))).toBeNull();
    expect(decodeSessionMessage(JSON.stringify({ noTag: true }))).toBeNull();
  });
});

describe("dispatchSessionMessage", () => {
  it("routes each kind to its handler (no switch)", () => {
    const h = { onStroke: vi.fn(), onSync: vi.fn(), onStep: vi.fn() };
    dispatchSessionMessage({ t: "stroke", surface: "x", stroke: STROKE }, h);
    expect(h.onStroke).toHaveBeenCalledWith("x", STROKE);
    dispatchSessionMessage({ t: "sync", surface: "x", strokes: [STROKE] }, h);
    expect(h.onSync).toHaveBeenCalledWith("x", [STROKE]);
    dispatchSessionMessage({ t: "step", step: 5 }, h);
    expect(h.onStep).toHaveBeenCalledWith(5);
  });
});
