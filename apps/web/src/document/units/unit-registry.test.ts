// WI-247 / DR-163 — registry wiring + the value-unit models' validation.

import { describe, expect, it } from "vitest";
import { getUnitModel } from "./unit-registry.js";

describe("unit registry", () => {
  it("resolves every modeled kind, and returns undefined for unmodeled kinds", () => {
    for (const kind of [
      "decoration.fill",
      "decoration.stroke",
      "decoration.shadow",
      "decoration.opacity",
      "decoration.filter",
      "transform.flip",
      "crop.window",
      "crop.offset",
    ]) {
      expect(getUnitModel(kind)?.kind).toBe(kind);
    }
    expect(getUnitModel("totally.unknown")).toBeUndefined();
  });

  it("fill validates the PaintSpec type + gradient stops", () => {
    const fill = getUnitModel("decoration.fill");
    expect(fill?.validate({ type: "solid", color: "#fff" }).ok).toBe(true);
    expect(fill?.validate({ type: "plaid" }).ok).toBe(false);
    expect(fill?.validate({ type: "linear-gradient", stops: [{ offset: 0 }] }).ok).toBe(false);
  });

  it("opacity requires a finite value and clamps to 0..1", () => {
    const op = getUnitModel("decoration.opacity");
    const r = op?.validate({ value: 1.5 });
    expect(r?.ok && (r.value as { value: number }).value).toBe(1);
    expect(op?.validate({ value: Number.NaN }).ok).toBe(false);
  });

  it("shadow / stroke / filter reject non-finite numeric fields", () => {
    expect(getUnitModel("decoration.shadow")?.validate({ x: Number.POSITIVE_INFINITY }).ok).toBe(
      false,
    );
    expect(getUnitModel("decoration.stroke")?.validate({ width: Number.NaN }).ok).toBe(false);
    expect(getUnitModel("decoration.filter")?.validate({ blur: Number.NaN }).ok).toBe(false);
    // valid structural inputs pass
    expect(
      getUnitModel("decoration.shadow")?.validate({ x: 1, y: 2, blur: 3, color: "#000" }).ok,
    ).toBe(true);
  });
});
