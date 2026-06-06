import { describe, expect, it } from "vitest";
import {
  type DesignSignature,
  diversityReport,
  documentToSignature,
  type SigDocument,
  type SigItem,
} from "./diversity-metric.js";

// ── Synthetic document builders (the serialized-JSON shape the extractor reads) ─
const solidFill = (color: string) => ({ kind: "decoration.fill", attrs: { type: "solid", color } });
const gradientFill = () => ({
  kind: "decoration.fill",
  attrs: { type: "linear-gradient", stops: [{ color: "#ff0000" }, { color: "#0000ff" }] },
});

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}
const text = (color: string, frame: Frame): SigItem => ({ kind: "text", attrs: { color, frame } });

function doc(bg: string, items: ReadonlyArray<SigItem>, gradient = false): SigDocument {
  return {
    root: {
      kind: "weave-doc",
      attrs: {},
      units: [gradient ? gradientFill() : solidFill(bg)],
      children: items,
    },
  };
}

describe("documentToSignature", () => {
  it("extracts the full-bleed root fill as bgColor and collects text colors", () => {
    const sig = documentToSignature(
      doc("#111111", [text("#ffffff", { x: 0.1, y: 0.1, width: 0.8, height: 0.2 })]),
    );
    expect(sig.bgColor).toBe("#111111");
    expect(sig.colors).toContain("#ffffff");
    expect(sig.layoutKey).toContain("flat");
  });

  it("falls back to the bg hint / doc attr when no full-bleed fill exists", () => {
    const bare: SigDocument = { root: { kind: "weave-doc", children: [] } };
    expect(documentToSignature(bare, "#222").bgColor).toBe("#222");
    expect(
      documentToSignature({ root: { kind: "weave-doc" }, attrs: { background: "#333" } }).bgColor,
    ).toBe("#333");
  });

  it("flags a gradient background in the layout key", () => {
    const sig = documentToSignature(doc("", [], true));
    expect(sig.layoutKey).toContain("gradient");
  });

  it("derives alignment from the mean item center", () => {
    const left = documentToSignature(
      doc("#fff", [text("#000", { x: 0.02, y: 0.1, width: 0.2, height: 0.1 })]),
    );
    const right = documentToSignature(
      doc("#fff", [text("#000", { x: 0.78, y: 0.1, width: 0.2, height: 0.1 })]),
    );
    expect(left.layoutKey).toContain("left");
    expect(right.layoutKey).toContain("right");
  });
});

describe("diversityReport — convergence detection (DR-077 D6)", () => {
  it("flags a CONVERGED batch (same palette + same layout)", () => {
    const sigs: DesignSignature[] = Array.from({ length: 5 }, () =>
      documentToSignature(
        doc("#111111", [text("#ffffff", { x: 0.1, y: 0.1, width: 0.8, height: 0.2 })]),
      ),
    );
    const report = diversityReport(sigs);
    expect(report.n).toBe(5);
    expect(report.meanDeltaE).toBeCloseTo(0, 3);
    expect(report.layoutEntropyBits).toBeCloseTo(0, 6);
    expect(report.distinctLayouts).toBe(1);
    expect(report.converged).toBe(true);
  });

  it("passes a DIVERSE batch (distinct palettes + distinct layouts)", () => {
    const sigs = [
      documentToSignature(
        doc("#e23b3b", [text("#fff", { x: 0.02, y: 0.1, width: 0.2, height: 0.1 })]),
      ),
      documentToSignature(
        doc("#2b6fe2", [
          text("#fff", { x: 0.4, y: 0.1, width: 0.3, height: 0.1 }),
          text("#fff", { x: 0.4, y: 0.3, width: 0.3, height: 0.1 }),
          text("#fff", { x: 0.4, y: 0.5, width: 0.3, height: 0.1 }),
          text("#fff", { x: 0.4, y: 0.7, width: 0.3, height: 0.1 }),
        ]),
      ),
      documentToSignature(
        doc(
          "#1f9d55",
          Array.from({ length: 10 }, (_, i) =>
            text("#000", { x: 0.7, y: 0.05 * i, width: 0.28, height: 0.18 }),
          ),
        ),
      ),
      documentToSignature(
        doc("#e2a93b", [text("#000", { x: 0.45, y: 0.4, width: 0.1, height: 0.1 })], true),
      ),
      documentToSignature(
        doc("#8e44ad", [text("#fff", { x: 0.45, y: 0.4, width: 0.1, height: 0.1 })]),
      ),
    ];
    const report = diversityReport(sigs);
    expect(report.colorSamples).toBe(5);
    expect(report.meanDeltaE).toBeGreaterThan(8); // saturated, far-apart hues
    expect(report.distinctLayouts).toBeGreaterThanOrEqual(3);
    expect(report.layoutEntropyBits).toBeGreaterThan(1);
    expect(report.converged).toBe(false);
  });

  it("excludes token backgrounds from the color sample (var(--…) not measurable)", () => {
    const sigs = [
      documentToSignature({ root: { kind: "weave-doc", units: [solidFill("var(--bg)")] } }),
      documentToSignature(doc("#123456", [])),
    ];
    const report = diversityReport(sigs);
    expect(report.colorSamples).toBe(1); // only the concrete #123456 counts
  });
});
