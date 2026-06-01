import { describe, expect, it } from "vitest";
import {
  basisFromFrameSample,
  basisFromLetterbox,
  clientToDesign,
  designToClient,
  designToHostPx,
  type ProjectionBasis,
} from "./coordinate-projection.js";

const DESIGN = { width: 1920, height: 1080 };

describe("basisFromFrameSample", () => {
  it("backs scale+origin out of a rendered frame sample", () => {
    // A frame occupying the top-left quarter of the design plane, rendered
    // at half scale (0.5px per design px) with the plane origin at (100,50).
    const frame = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const sampleRect = {
      left: 100,
      top: 50,
      width: 0.5 * DESIGN.width * 0.5, // frame.width * design.width * scale
      height: 0.5 * DESIGN.height * 0.5,
    };
    const basis = basisFromFrameSample(sampleRect, frame, DESIGN);
    expect(basis).not.toBeNull();
    expect(basis?.scaleX).toBeCloseTo(0.5);
    expect(basis?.scaleY).toBeCloseTo(0.5);
    expect(basis?.originX).toBeCloseTo(100);
    expect(basis?.originY).toBeCloseTo(50);
  });

  it("accounts for a non-origin frame offset", () => {
    const frame = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const scale = 0.5;
    const sampleRect = {
      left: 100 + frame.x * DESIGN.width * scale,
      top: 50 + frame.y * DESIGN.height * scale,
      width: frame.width * DESIGN.width * scale,
      height: frame.height * DESIGN.height * scale,
    };
    const basis = basisFromFrameSample(sampleRect, frame, DESIGN);
    expect(basis?.originX).toBeCloseTo(100);
    expect(basis?.originY).toBeCloseTo(50);
  });

  it("returns null on a degenerate rect or frame", () => {
    const frame = { x: 0, y: 0, width: 0.5, height: 0.5 };
    expect(
      basisFromFrameSample({ left: 0, top: 0, width: 0, height: 10 }, frame, DESIGN),
    ).toBeNull();
    expect(
      basisFromFrameSample(
        { left: 0, top: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 0, height: 0.5 },
        DESIGN,
      ),
    ).toBeNull();
  });
});

describe("basisFromLetterbox", () => {
  it("fits-and-centres the design plane, letterboxing the wider axis", () => {
    // Host wider than design aspect → vertical fit, horizontal letterbox.
    const hostRect = { left: 0, top: 0, width: 2400, height: 1080 };
    const basis = basisFromLetterbox(hostRect, DESIGN);
    expect(basis).not.toBeNull();
    expect(basis?.scaleX).toBeCloseTo(1); // 1080/1080
    expect(basis?.scaleY).toBeCloseTo(1);
    expect(basis?.originX).toBeCloseTo((2400 - 1920) / 2); // 240 letterbox
    expect(basis?.originY).toBeCloseTo(0);
  });

  it("returns null when the host has no area", () => {
    expect(basisFromLetterbox({ left: 0, top: 0, width: 0, height: 0 }, DESIGN)).toBeNull();
  });
});

describe("projection round-trip", () => {
  const basis: ProjectionBasis = { scaleX: 0.5, scaleY: 0.75, originX: 100, originY: 50 };

  it("clientToDesign and designToClient are exact inverses", () => {
    const client = { x: 640, y: 410 };
    const design = clientToDesign(basis, client.x, client.y);
    const back = designToClient(basis, design.x, design.y);
    expect(back.x).toBeCloseTo(client.x);
    expect(back.y).toBeCloseTo(client.y);
  });

  it("designToHostPx is designToClient minus host top-left", () => {
    const hostLeft = 30;
    const hostTop = 12;
    const host = designToHostPx(basis, 200, 100, hostLeft, hostTop);
    const client = designToClient(basis, 200, 100);
    expect(host.x).toBeCloseTo(client.x - hostLeft);
    expect(host.y).toBeCloseTo(client.y - hostTop);
  });
});
