// WI-140 — QR centre-logo scannability-defense helpers. These guard the two
// generation-time invariants from DR-095: the logo-width clamp and the EC floor.
import { describe, expect, it } from "vitest";
import {
  clampLogoScale,
  effectiveQrEcLevel,
  QR_LOGO_DEFAULT_SCALE,
  QR_LOGO_MAX_SCALE,
  raiseEc,
  recommendedEcForLogo,
} from "./qr-logo.js";

describe("clampLogoScale", () => {
  it("clamps above the ceiling and below zero", () => {
    expect(clampLogoScale(0.9)).toBe(QR_LOGO_MAX_SCALE);
    expect(clampLogoScale(-1)).toBe(0);
  });

  it("passes valid values through", () => {
    expect(clampLogoScale(0.1)).toBe(0.1);
  });

  it("falls back to the default for non-finite / missing", () => {
    expect(clampLogoScale(undefined)).toBe(QR_LOGO_DEFAULT_SCALE);
    expect(clampLogoScale(Number.NaN)).toBe(QR_LOGO_DEFAULT_SCALE);
  });
});

describe("raiseEc", () => {
  it("raises up to the floor but never lowers", () => {
    expect(raiseEc("L", "Q")).toBe("Q");
    expect(raiseEc("H", "Q")).toBe("H");
    expect(raiseEc("Q", "Q")).toBe("Q");
  });
});

describe("recommendedEcForLogo", () => {
  it("bumps L/M to H, keeps Q/H", () => {
    expect(recommendedEcForLogo("L")).toBe("H");
    expect(recommendedEcForLogo("M")).toBe("H");
    expect(recommendedEcForLogo("Q")).toBe("Q");
    expect(recommendedEcForLogo("H")).toBe("H");
  });
});

describe("effectiveQrEcLevel", () => {
  const base = { frame: { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 }, data: "x" } as const;

  it("floors at Q when a logo is present (safety net)", () => {
    expect(effectiveQrEcLevel({ ...base, ecLevel: "L", logo: { iconId: "link" } })).toBe("Q");
  });

  it("leaves EC untouched without a logo", () => {
    expect(effectiveQrEcLevel({ ...base, ecLevel: "L" })).toBe("L");
    expect(effectiveQrEcLevel({ ...base })).toBe("M");
  });

  it("does not lower an already-high EC", () => {
    expect(effectiveQrEcLevel({ ...base, ecLevel: "H", logo: { iconId: "star" } })).toBe("H");
  });
});
