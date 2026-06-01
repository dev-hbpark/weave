import { describe, expect, it } from "vitest";
import { type AddBoxPlacement, computeAddFrame } from "./add-geometry.js";

const LINE_HEIGHT = 1.4;

const CENTRED: AddBoxPlacement = {
  wRatio: 0.4,
  hTargetRatio: 0.4,
  cxRatio: 0.5,
  cyRatio: 0.5,
  parentHeightPx: 1080,
};

describe("computeAddFrame — non-text", () => {
  it("centres the box and uses the target ratios verbatim", () => {
    const { frame, fontSizePx, fontSizeRatio } = computeAddFrame(CENTRED, false, LINE_HEIGHT);
    expect(frame).toEqual({
      x: 0.5 - 0.2,
      y: 0.5 - 0.2,
      width: 0.4,
      height: 0.4,
      rotation: 0,
    });
    expect(fontSizePx).toBeUndefined();
    expect(fontSizeRatio).toBeUndefined();
  });

  it("offsets x/y by half the box for a non-centred placement", () => {
    const placement: AddBoxPlacement = { ...CENTRED, cxRatio: 0.25, cyRatio: 0.75 };
    const { frame } = computeAddFrame(placement, false, LINE_HEIGHT);
    expect(frame.x).toBeCloseTo(0.25 - 0.2);
    expect(frame.y).toBeCloseTo(0.75 - 0.2);
  });
});

describe("computeAddFrame — text", () => {
  it("snaps the box height to exactly one line of the fitted font", () => {
    // target height = 0.3 * 1080 = 324px; fontSize = round(324/1.4) = 231;
    // box height px = 231 * 1.4 = 323.4; hRatio = 323.4/1080.
    const placement: AddBoxPlacement = { ...CENTRED, hTargetRatio: 0.3 };
    const { frame, fontSizePx, fontSizeRatio } = computeAddFrame(placement, true, LINE_HEIGHT);
    expect(fontSizePx).toBe(231);
    expect(fontSizeRatio).toBeCloseTo(231 / 1080);
    expect(frame.height).toBeCloseTo((231 * LINE_HEIGHT) / 1080);
    // Height must equal exactly one line of the reported font.
    expect(frame.height * placement.parentHeightPx).toBeCloseTo((fontSizePx ?? 0) * LINE_HEIGHT);
  });

  it("clamps the font to a minimum of 1px for a tiny parent", () => {
    const placement: AddBoxPlacement = {
      ...CENTRED,
      hTargetRatio: 0.3,
      parentHeightPx: 2,
    };
    const { fontSizePx } = computeAddFrame(placement, true, LINE_HEIGHT);
    expect(fontSizePx).toBeGreaterThanOrEqual(1);
  });
});
