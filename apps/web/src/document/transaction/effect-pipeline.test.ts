// WI-249 / DR-164 — effect pipeline mechanics + relayout no-op guards.
// (The positive relayout path needs the layout engine + LAYOUT_FEATURE_ENABLED;
//  its behaviour is covered by the existing layout/relayout suite + e2e, which
//  stay green now that computeAttrsPatches routes through the pipeline.)

import { describe, expect, it } from "vitest";
import { applyEffects, registeredEffectNames } from "./effect-pipeline.js";
import { relayoutEffect } from "./relayout-effect.js";

const ctx = { document: { root: {} } } as never;

describe("effect pipeline", () => {
  it("registers the relayout effect", () => {
    expect(registeredEffectNames()).toContain("relayout");
  });

  it("cheap-skips effects when no primary patch matches their reactsTo kinds", () => {
    // relayout reacts to item.attrs only → a unit.create patch triggers nothing.
    const r = applyEffects(ctx, [{ type: "unit.create" } as never]);
    expect(r.ok && r.value).toEqual([]);
  });

  it("relayout derives nothing for a position-only move (no size change)", () => {
    const move = {
      type: "item.attrs",
      itemId: "i",
      before: { frame: { x: 0, y: 0, width: 10, height: 10 } },
      after: { frame: { x: 5, y: 5, width: 10, height: 10 } },
    } as never;
    const r = relayoutEffect.derive(ctx, [move], {});
    expect(r.ok && r.value).toEqual([]);
  });

  it("relayout derives nothing when the patch carries no frame", () => {
    const noFrame = {
      type: "item.attrs",
      itemId: "i",
      before: {},
      after: { opacity: 0.5 },
    } as never;
    const r = relayoutEffect.derive(ctx, [noFrame], {});
    expect(r.ok && r.value).toEqual([]);
  });
});
