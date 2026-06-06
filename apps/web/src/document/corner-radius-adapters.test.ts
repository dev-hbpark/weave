import { describe, expect, it } from "vitest";
import { cornerRadiusAdapter } from "./corner-radius-adapters.js";

type ExecCall = { name: string; input: Record<string, unknown> };

/** Minimal editor stub: records exec() calls. For `weave.item.update` the test
 *  invokes the captured `patch` against a supplied prev-attrs to inspect the
 *  resulting attrs map. */
function fakeEditor() {
  const calls: ExecCall[] = [];
  const editor = {
    exec: (name: string, input: Record<string, unknown>) => {
      calls.push({ name, input });
      return { ok: true };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { editor, calls };
}

function applyPatch(call: ExecCall, prevAttrs: Record<string, unknown>): Record<string, unknown> {
  const patch = call.input.patch as (p: { attrs: Record<string, unknown> }) => {
    attrs: Record<string, unknown>;
  };
  return patch({ attrs: prevAttrs }).attrs;
}

describe("cornerRadiusAdapter — media kinds (frame/image/video)", () => {
  it("read() prefers the per-corner tuple, else the scalar (all-equal)", () => {
    const frame = cornerRadiusAdapter("frame");
    if (frame === null) throw new Error("no frame adapter");
    expect(frame.read({ cornerRadius: 12 })).toEqual({ tl: 12, tr: 12, br: 12, bl: 12 });
    expect(frame.read({ cornerRadius: 12, cornerRadii: { tl: 1, tr: 2, br: 3, bl: 4 } })).toEqual({
      tl: 1,
      tr: 2,
      br: 3,
      bl: 4,
    });
    expect(frame.read({})).toEqual({ tl: 0, tr: 0, br: 0, bl: 0 });
  });

  it("image/video read the `borderRadius` / `borderRadii` keys", () => {
    const image = cornerRadiusAdapter("image");
    if (image === null) throw new Error("no image adapter");
    expect(image.read({ borderRadius: 5 })).toEqual({ tl: 5, tr: 5, br: 5, bl: 5 });
    expect(image.read({ borderRadii: { tl: 1, tr: 2, br: 3, bl: 4 } })).toEqual({
      tl: 1,
      tr: 2,
      br: 3,
      bl: 4,
    });
  });

  it("writeCorner updates ONE key of the tuple (seeded from current)", () => {
    const { editor, calls } = fakeEditor();
    const frame = cornerRadiusAdapter("frame")!;
    frame.writeCorner(editor, "f1", "tr", 20);
    expect(calls[0]!.name).toBe("weave.item.update");
    // Seeds from the scalar (8) then overrides tr.
    expect(applyPatch(calls[0]!, { cornerRadius: 8 }).cornerRadii).toEqual({
      tl: 8,
      tr: 20,
      br: 8,
      bl: 8,
    });
  });

  it("writeUniform sets the scalar AND drops the per-corner tuple", () => {
    const { editor, calls } = fakeEditor();
    const frame = cornerRadiusAdapter("frame")!;
    frame.writeUniform(editor, "f1", 14);
    const after = applyPatch(calls[0]!, {
      cornerRadius: 2,
      cornerRadii: { tl: 1, tr: 2, br: 3, bl: 4 },
    });
    expect(after.cornerRadius).toBe(14);
    expect("cornerRadii" in after).toBe(false); // tuple removed → scalar fast-path
  });

  it("enterSplit seeds the tuple from the current uniform value", () => {
    const { editor, calls } = fakeEditor();
    const image = cornerRadiusAdapter("image")!;
    image.enterSplit(editor, "i1");
    expect(applyPatch(calls[0]!, { borderRadius: 6 }).borderRadii).toEqual({
      tl: 6,
      tr: 6,
      br: 6,
      bl: 6,
    });
  });
});

describe("cornerRadiusAdapter — shape (command-driven)", () => {
  it("writeCorner → setCornerRadius with a per-corner partial", () => {
    const { editor, calls } = fakeEditor();
    const shape = cornerRadiusAdapter("shape")!;
    shape.writeCorner(editor, "s1", "bl", 7);
    expect(calls[0]).toEqual({
      name: "weave.shape.setCornerRadius",
      input: { itemId: "s1", radii: { bl: 7 } },
    });
  });
  it("writeUniform → setCornerRadius with a uniform radius", () => {
    const { editor, calls } = fakeEditor();
    const shape = cornerRadiusAdapter("shape")!;
    shape.writeUniform(editor, "s1", 9);
    expect(calls[0]).toEqual({
      name: "weave.shape.setCornerRadius",
      input: { itemId: "s1", radius: 9 },
    });
  });
  it("read() comes from subAttrs.cornerRadii", () => {
    const shape = cornerRadiusAdapter("shape")!;
    expect(shape.read({ subAttrs: { cornerRadii: { tl: 1, tr: 2, br: 3, bl: 4 } } })).toEqual({
      tl: 1,
      tr: 2,
      br: 3,
      bl: 4,
    });
  });
});

describe("cornerRadiusAdapter — kinds without a corner surface", () => {
  it("returns null for text / line / chart / qr", () => {
    expect(cornerRadiusAdapter("text")).toBeNull();
    expect(cornerRadiusAdapter("line")).toBeNull();
    expect(cornerRadiusAdapter("chart")).toBeNull();
    expect(cornerRadiusAdapter("qr")).toBeNull();
  });
});
