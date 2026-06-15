import { describe, expect, it } from "vitest";
import {
  archetypeById,
  archetypeForSeed,
  COMPOSITION_ARCHETYPES,
  composeArchetypeDirective,
} from "./composition-archetypes.js";

// WI-233 — the structural diversity axis. The design-style axis varies the LOOK
// (palette/effects); this varies the MACRO composition so two runs of the same
// content + style read as genuinely different layouts instead of the same band
// stack in new colors. Each archetype must be palette-agnostic structure, and the
// per-seed pick must rotate every generation while preserving the fit-safety note.
describe("COMPOSITION_ARCHETYPES catalog (WI-233)", () => {
  it("has unique ids and a concrete recipe per archetype", () => {
    expect(COMPOSITION_ARCHETYPES.length).toBeGreaterThanOrEqual(8);
    const ids = COMPOSITION_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of COMPOSITION_ARCHETYPES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.recipe.length).toBeGreaterThan(20);
    }
  });

  it("carries the topology-breaking archetypes (not just grid-of-bands)", () => {
    const ids = new Set(COMPOSITION_ARCHETYPES.map((a) => a.id));
    for (const id of ["full-bleed-hero", "asymmetric-split", "layered-overlap", "big-number-focal"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("recipes are palette-agnostic — no literal hex colors (palette comes from the style spec)", () => {
    for (const a of COMPOSITION_ARCHETYPES) {
      expect(a.recipe, a.id).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("archetypeById / archetypeForSeed", () => {
  it("resolves a known id; null/undefined/unknown → undefined", () => {
    expect(archetypeById("full-bleed-hero")?.id).toBe("full-bleed-hero");
    expect(archetypeById(null)).toBeUndefined();
    expect(archetypeById(undefined)).toBeUndefined();
    expect(archetypeById("nope")).toBeUndefined();
  });

  it("is deterministic in the seed and rotates EVERY seed (step 1)", () => {
    expect(archetypeForSeed(3).id).toBe(archetypeForSeed(3).id);
    expect(archetypeForSeed(0).id).not.toBe(archetypeForSeed(1).id);
    // cycles through the whole catalog over a full period.
    const seen = new Set<string>();
    for (let s = 0; s < COMPOSITION_ARCHETYPES.length; s += 1) seen.add(archetypeForSeed(s).id);
    expect(seen.size).toBe(COMPOSITION_ARCHETYPES.length);
  });
});

describe("composeArchetypeDirective", () => {
  it("names the seed's archetype and restates the fit-safety boundary", () => {
    const dir = composeArchetypeDirective(0);
    expect(dir).toContain(archetypeForSeed(0).label);
    expect(dir).toContain("구도(매크로)");
    // fit-safety is preserved: groups still use auto-layout internally.
    expect(dir).toContain("auto-layout");
    // and it explicitly forbids the uniform band stack.
    expect(dir).toMatch(/밴드 스택/);
    // palette stays owned by the style spec, not the archetype.
    expect(dir).toMatch(/팔레트·폰트·효과는 스타일 스펙/);
  });
});
