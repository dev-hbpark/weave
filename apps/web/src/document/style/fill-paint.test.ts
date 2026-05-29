// WI-056 — gradient round-trip parser tests.
import { paintToCss } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { isGradientEmit, parseLinearGradientPaint } from "./fill-paint.js";

describe("parseLinearGradientPaint", () => {
  it("parses the ColorPicker canonical emit into a linear-gradient PaintSpec", () => {
    const spec = parseLinearGradientPaint("linear-gradient(90deg, #ff0000 0%, #0000ff 100%)");
    expect(spec).toEqual({
      type: "linear-gradient",
      angle: 90,
      stops: [
        { color: "#ff0000", offset: 0 },
        { color: "#0000ff", offset: 1 },
      ],
    });
  });

  it("round-trips with agocraft paintToCss", () => {
    const css = "linear-gradient(45deg, #112233 0%, #445566 50%, #778899 100%)";
    const spec = parseLinearGradientPaint(css);
    expect(spec).not.toBeNull();
    if (spec === null) return;
    expect(paintToCss(spec)).toBe(css);
  });

  it("accepts 8-digit hex (alpha) stops", () => {
    const spec = parseLinearGradientPaint("linear-gradient(0deg, #ff000080 0%, #0000ffff 100%)");
    expect(spec?.type).toBe("linear-gradient");
    if (spec?.type !== "linear-gradient") return;
    expect(spec.stops[0]?.color).toBe("#ff000080");
  });

  it("normalizes the angle into 0..360", () => {
    const spec = parseLinearGradientPaint("linear-gradient(-90deg, #000000 0%, #ffffff 100%)");
    expect(spec?.type === "linear-gradient" && spec.angle).toBe(270);
  });

  it("returns null for a solid hex", () => {
    expect(parseLinearGradientPaint("#ff0000")).toBeNull();
  });

  it("returns null for a var() token", () => {
    expect(parseLinearGradientPaint("var(--accent)")).toBeNull();
  });

  it("returns null for a single-stop gradient", () => {
    expect(parseLinearGradientPaint("linear-gradient(90deg, #ff0000 0%)")).toBeNull();
  });
});

describe("isGradientEmit", () => {
  it("detects linear-gradient strings", () => {
    expect(isGradientEmit("linear-gradient(90deg, #000 0%, #fff 100%)")).toBe(true);
    expect(isGradientEmit("#ff0000")).toBe(false);
    expect(isGradientEmit("var(--accent)")).toBe(false);
  });
});
