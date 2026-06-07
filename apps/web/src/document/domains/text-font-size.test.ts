// DR-093 — fontSizeSpec single-source-of-truth helpers.

import { describe, expect, it } from "vitest";
import { displayFontSizePx, fontSizeAttrsForPx } from "./text-font-size.js";

describe("displayFontSizePx (resolve from spec, not the legacy mirror)", () => {
  it("px spec → its value, regardless of parent height", () => {
    expect(displayFontSizePx({ fontSizeSpec: { kind: "px", value: 32 }, fontSize: 999 }, 500)).toBe(
      32,
    );
  });

  it("ratio spec → value × parent height (ignores the stale mirror)", () => {
    // fontSize mirror is a STALE 24, but the spec is authoritative.
    expect(
      displayFontSizePx({ fontSizeSpec: { kind: "ratio", value: 0.1 }, fontSize: 24 }, 500),
    ).toBe(50);
  });

  it("no spec → falls back to the legacy fontSize mirror", () => {
    expect(displayFontSizePx({ fontSize: 18 }, 500)).toBe(18);
  });
});

describe("fontSizeAttrsForPx (preserve kind, sync mirror)", () => {
  it("ratio text stays responsive: value = px ÷ parentHeight, mirror = px", () => {
    const next = fontSizeAttrsForPx({ fontSizeSpec: { kind: "ratio", value: 0.1 } }, 60, 600);
    expect(next).toEqual({ fontSize: 60, fontSizeSpec: { kind: "ratio", value: 0.1 } });
  });

  it("px text stays absolute: spec value = px, mirror = px", () => {
    const next = fontSizeAttrsForPx({ fontSizeSpec: { kind: "px", value: 20 } }, 40, 600);
    expect(next).toEqual({ fontSize: 40, fontSizeSpec: { kind: "px", value: 40 } });
  });

  it("spec-less text becomes px", () => {
    expect(fontSizeAttrsForPx({ fontSize: 24 }, 36, 600)).toEqual({
      fontSize: 36,
      fontSizeSpec: { kind: "px", value: 36 },
    });
  });

  it("ratio with no parent height (0) degrades to px (no divide-by-zero)", () => {
    expect(fontSizeAttrsForPx({ fontSizeSpec: { kind: "ratio", value: 0.1 } }, 40, 0)).toEqual({
      fontSize: 40,
      fontSizeSpec: { kind: "px", value: 40 },
    });
  });
});
