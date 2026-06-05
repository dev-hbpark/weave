// @vitest-environment node
//
// DR-062 — per-range typography registry round-trip. Each descriptor's
// `toCss` / `fromCss` must be inverse for a representative value so the author
// → node-style → read-back → run-attr cycle is lossless (the seed and
// `readSnapshot` both rely on it).

import { expect, test } from "vitest";
import { RANGE_STYLE_PROPS, rangeStyleProp } from "./range-style-registry.js";

const CASES: ReadonlyArray<{ attrKey: string; value: string | number; css: string }> = [
  { attrKey: "color", value: "#ff0000", css: "#ff0000" },
  { attrKey: "fontSize", value: 32, css: "32px" },
  { attrKey: "fontFamily", value: "Georgia, serif", css: "Georgia, serif" },
  { attrKey: "letterSpacing", value: 2, css: "2px" },
  { attrKey: "textCase", value: "UPPER", css: "uppercase" },
];

test("every registered prop round-trips value → CSS → value", () => {
  for (const c of CASES) {
    const p = rangeStyleProp(c.attrKey as never);
    expect(p, `descriptor for ${c.attrKey}`).toBeDefined();
    expect(p?.toCss(c.value)).toBe(c.css);
    expect(p?.fromCss(c.css)).toBe(c.value);
  }
});

test("toCss clears (null) on absent / out-of-domain values", () => {
  const color = rangeStyleProp("color");
  expect(color?.toCss(undefined)).toBeNull();
  expect(color?.toCss("")).toBeNull();
  const size = rangeStyleProp("fontSize");
  expect(size?.toCss(0)).toBeNull();
  expect(size?.toCss(undefined)).toBeNull();
  const tcase = rangeStyleProp("textCase");
  // ORIGINAL / SMALL_CAPS have no plain text-transform → clear.
  expect(tcase?.toCss("ORIGINAL")).toBeNull();
  expect(tcase?.toCss("SMALL_CAPS")).toBeNull();
});

test("letterSpacing round-trips zero and negatives (a valid spacing)", () => {
  const ls = rangeStyleProp("letterSpacing");
  expect(ls?.toCss(0)).toBe("0px");
  expect(ls?.fromCss("0px")).toBe(0);
  expect(ls?.toCss(-1.5)).toBe("-1.5px");
  expect(ls?.fromCss("-1.5px")).toBe(-1.5);
});

test("the registry is the single source — no duplicate attrKeys", () => {
  const keys = RANGE_STYLE_PROPS.map((p) => p.attrKey);
  expect(new Set(keys).size).toBe(keys.length);
});
