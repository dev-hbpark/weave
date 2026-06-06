import { describe, expect, it } from "vitest";
import {
  composeToneTask,
  picksToIds,
  presetById,
  presetToRegister,
  resolveTonePicks,
  TONE_PRESETS,
} from "./compose-tone.js";
import { type AxisKey, axisByKey, optionById, TONE_AXES } from "./tone-axes.js";

describe("TONE_PRESETS (DR-077 D1 — curated entry points)", () => {
  it("preserves the 7 named tones with unique ids", () => {
    const ids = TONE_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["editorial", "bold", "minimal", "warm", "retro", "luxury", "playful"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every pin references a real option in its axis (integrity)", () => {
    for (const preset of TONE_PRESETS) {
      for (const [key, optionId] of Object.entries(preset.pins)) {
        const axis = axisByKey(key as AxisKey);
        expect(axis, `axis ${key} exists`).toBeDefined();
        expect(
          optionById(axis!, optionId as string),
          `${preset.id}.${key} → ${optionId}`,
        ).toBeDefined();
      }
    }
  });

  it("leaves at least one axis FREE so even a fixed pick varies", () => {
    for (const preset of TONE_PRESETS) {
      expect(Object.keys(preset.pins).length).toBeLessThan(TONE_AXES.length);
    }
  });
});

describe("presetById", () => {
  it("resolves a known id; null/undefined/unknown → undefined (자동)", () => {
    expect(presetById("editorial")?.id).toBe("editorial");
    expect(presetById(null)).toBeUndefined();
    expect(presetById(undefined)).toBeUndefined();
    expect(presetById("nope")).toBeUndefined();
  });
});

describe("resolveTonePicks", () => {
  it("returns one option per axis, deterministic in the seed", () => {
    const a = resolveTonePicks({ seed: 11 });
    const b = resolveTonePicks({ seed: 11 });
    expect(picksToIds(a)).toEqual(picksToIds(b));
    for (const axis of TONE_AXES) expect(axis.options).toContain(a[axis.key]);
  });

  it("pins the preset's identity axes regardless of seed (identity survives)", () => {
    const editorial = presetById("editorial")!;
    for (let seed = 0; seed < 12; seed += 1) {
      const picks = resolveTonePicks({ preset: editorial, seed });
      expect(picks.palette.id).toBe("ink");
      expect(picks.typography.id).toBe("serif-display");
      expect(picks.layout.id).toBe("column-grid");
    }
  });

  it("varies FREE axes across seeds (within-preset variety)", () => {
    const warm = presetById("warm")!; // pins palette + shape; typo/layout/decor free
    const layouts = new Set(
      Array.from({ length: 10 }, (_, seed) => resolveTonePicks({ preset: warm, seed }).layout.id),
    );
    expect(layouts.size).toBeGreaterThan(1); // free axis genuinely rotates
  });

  it("steers free axes away from the previous picks (D4 anti-convergence)", () => {
    const warm = presetById("warm")!;
    const first = resolveTonePicks({ preset: warm, seed: 4 });
    const exclude = picksToIds(first);
    const next = resolveTonePicks({ preset: warm, seed: 4, exclude });
    // Same seed, but free axes must move off the excluded ids…
    expect(next.layout.id).not.toBe(first.layout.id);
    expect(next.decor.id).not.toBe(first.decor.id);
    // …while the pinned palette is unchanged (identity ignores exclusion).
    expect(next.palette.id).toBe(first.palette.id);
  });
});

describe("presetToRegister (HANDOFF-025)", () => {
  it("maps every preset to a register, and 자동/unknown → undefined", () => {
    const expected: Record<string, string> = {
      editorial: "editorial",
      minimal: "sober",
      luxury: "sober",
      bold: "expressive",
      retro: "expressive",
      warm: "expressive",
      playful: "playful",
    };
    for (const p of TONE_PRESETS) {
      expect(presetToRegister(p.id)).toBe(expected[p.id]); // every preset covered
    }
    expect(presetToRegister(null)).toBeUndefined();
    expect(presetToRegister(undefined)).toBeUndefined();
    expect(presetToRegister("nope")).toBeUndefined();
  });
});

describe("composeToneTask", () => {
  it("emits a [디자인 톤] block carrying every axis fragment + the commit tail", () => {
    const picks = resolveTonePicks({ preset: presetById("bold")!, seed: 2 });
    const line = composeToneTask(picks);
    expect(line).toContain("[디자인 톤]");
    for (const axis of TONE_AXES) expect(line).toContain(picks[axis.key].prompt);
    expect(line).toContain("끌려가지 마세요"); // commit tail steers off the active theme
  });
});
