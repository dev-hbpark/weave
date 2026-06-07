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
  const plainFrame = {
    id: "plainFrame",
    kind: "frame",
    attrs: { frame: frame(0, 0.5, 1, 0.5) }, // no layout → free placement
    children: [],
  };
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: [freeFrame, flexFrame, plainFrame] },
  } as unknown as AgocraftDocument;
}

const FIXED = {
  kind: "absolute-constraints",
  anchor: { horizontal: "left", vertical: "top" },
};

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

  it("does NOT touch text added into a flex frame (layout owns the size)", () => {
    const input = { kind: "text", containerId: "flexFrame", attrsOverride: { text: "hi" } };
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
