// 아쿠 — agent font-size grounding (px target → responsive ratio). Pure transform.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { groundAgentFontSize } from "./agent-font-grounding.js";

const frame = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
  rotation: 0,
});

// root(full) → frameA(h 0.5) → txt(h 0.4). At design 1000×1000: frameA px h = 500.
function makeDoc(): AgocraftDocument {
  const txt = {
    id: "txt",
    kind: "text",
    attrs: { frame: frame(0.1, 0.1, 0.8, 0.4), fontSizeSpec: { kind: "px", value: 30 } },
    children: [],
  };
  const frameA = {
    id: "frameA",
    kind: "frame",
    attrs: { frame: frame(0, 0, 1, 0.5) },
    children: [txt],
  };
  return {
    root: { id: "root", kind: "frame", attrs: {}, children: [frameA] },
  } as unknown as AgocraftDocument;
}

const design = { width: 1000, height: 1000 };
// biome-ignore lint/suspicious/noExplicitAny: test reads grounded attrs off an open bag
const attrsOf = (out: unknown, key: "attrsOverride" | "attrs"): any => (out as any)[key];

describe("groundAgentFontSize", () => {
  it("item.add: px → ratio against the CONTAINER frame height (500px)", () => {
    const out = groundAgentFontSize(
      "weave.item.add",
      {
        kind: "text",
        containerId: "frameA",
        attrsOverride: { fontSizeSpec: { kind: "px", value: 50 } },
      },
      makeDoc(),
      design,
    );
    expect(attrsOf(out, "attrsOverride").fontSizeSpec).toEqual({ kind: "ratio", value: 0.1 });
    expect(attrsOf(out, "attrsOverride").fontSize).toBe(50);
  });

  it("item.add into root: px → ratio against the design height (1000px)", () => {
    const out = groundAgentFontSize(
      "weave.item.add",
      { kind: "text", attrsOverride: { fontSizeSpec: { kind: "px", value: 50 } } },
      makeDoc(),
      design,
    );
    expect(attrsOf(out, "attrsOverride").fontSizeSpec).toEqual({ kind: "ratio", value: 0.05 });
  });

  it("re-grounds a px magnitude mis-tagged as ratio (value > 1)", () => {
    const out = groundAgentFontSize(
      "weave.item.add",
      {
        kind: "text",
        containerId: "frameA",
        attrsOverride: { fontSizeSpec: { kind: "ratio", value: 50 } },
      },
      makeDoc(),
      design,
    );
    expect(attrsOf(out, "attrsOverride").fontSizeSpec).toEqual({ kind: "ratio", value: 0.1 });
  });

  it("leaves a legitimate ratio (value ≤ 1) untouched (same reference)", () => {
    const input = {
      kind: "text",
      containerId: "frameA",
      attrsOverride: { fontSizeSpec: { kind: "ratio", value: 0.08 } },
    };
    expect(groundAgentFontSize("weave.item.add", input, makeDoc(), design)).toBe(input);
  });

  it("item.update: px → ratio against the edited text's current parent (500px)", () => {
    const out = groundAgentFontSize(
      "weave.item.update",
      { itemId: "txt", attrs: { fontSizeSpec: { kind: "px", value: 50 } } },
      makeDoc(),
      design,
    );
    expect(attrsOf(out, "attrs").fontSizeSpec).toEqual({ kind: "ratio", value: 0.1 });
    expect(attrsOf(out, "attrs").fontSize).toBe(50);
  });

  it("ignores non-text add, unknown commands, and a zero-sized design", () => {
    const add = {
      kind: "shape",
      containerId: "frameA",
      attrsOverride: { fontSizeSpec: { kind: "px", value: 50 } },
    };
    expect(groundAgentFontSize("weave.item.add", add, makeDoc(), design)).toBe(add);
    const t = { kind: "text", attrsOverride: { fontSizeSpec: { kind: "px", value: 50 } } };
    expect(groundAgentFontSize("weave.unknown", t, makeDoc(), design)).toBe(t);
    expect(groundAgentFontSize("weave.item.add", t, makeDoc(), { width: 0, height: 0 })).toBe(t);
  });

  it("does not touch items.update (one attrs, possibly mixed parents)", () => {
    const input = { itemIds: ["txt"], attrs: { fontSizeSpec: { kind: "px", value: 50 } } };
    expect(groundAgentFontSize("weave.items.update", input, makeDoc(), design)).toBe(input);
  });
});
