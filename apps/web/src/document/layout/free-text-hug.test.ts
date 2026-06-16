// WI-051 follow-up — free-text edit re-hug: structural guards + node safety.
// In node there is no Canvas2D measurer, so measureFreeTextHugRatio is undefined and
// hugFreeTextAttrs is a pass-through — this locks that it never throws / mutates the
// edit when measurement is unavailable (and the non-text / Fixed guards).

import { describe, expect, it } from "vitest";
import { hugFreeTextAttrs } from "./free-text-hug.js";

const META = { createdAt: "t", updatedAt: "t", schemaVersion: 11 };
// biome-ignore lint/suspicious/noExplicitAny: minimal structural doc for the tree walkers
function doc(child: any): any {
  return {
    root: {
      id: "root",
      kind: "frame",
      attrs: { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } },
      units: [],
      children: [child],
      meta: META,
    },
  };
}
// biome-ignore lint/suspicious/noExplicitAny: structural test item
const textItem = (attrs: Record<string, unknown>): any => ({
  id: "t",
  kind: "text",
  attrs: { frame: { x: 0.4, y: 0.4, width: 0.2, height: 0.1, rotation: 0 }, ...attrs },
  units: [],
  children: [],
  meta: META,
});

describe("hugFreeTextAttrs (edit re-hug — node safety / guards)", () => {
  it("returns nextAttrs unchanged for a non-text item", () => {
    const shape = { id: "t", kind: "shape", attrs: {}, units: [], children: [], meta: META };
    const next = { text: "x" };
    expect(hugFreeTextAttrs(doc(shape), "t", next, 1000, 500)).toBe(next);
  });

  it("is a pass-through when no measurer is available (node) — never throws/mutates", () => {
    const next = { text: "much longer typed text" };
    const out = hugFreeTextAttrs(
      doc(textItem({ text: "x", fontFamily: "Inter", fontSize: 24 })),
      "t",
      next,
      1000,
      500,
    );
    expect(out).toEqual(next); // no measurer ⇒ no frame injected
    expect((out as { frame?: unknown }).frame).toBeUndefined();
  });

  it("returns nextAttrs unchanged when the item is missing", () => {
    const next = { text: "x" };
    expect(hugFreeTextAttrs(doc(textItem({})), "missing", next, 1000, 500)).toBe(next);
  });
});
