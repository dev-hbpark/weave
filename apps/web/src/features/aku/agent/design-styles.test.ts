import { describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import { archetypeForSeed } from "./composition-archetypes.js";
import {
  autoStyleDirective,
  composeStyleTask,
  DESIGN_STYLES,
  randomStyleInGroup,
  resolveStyleSelection,
  STYLE_GROUPS,
  styleById,
  styleToRegister,
  variationLine,
} from "./design-styles.js";

const REGISTERS = ["sober", "editorial", "expressive", "playful"];

describe("DESIGN_STYLES catalog (DR-079)", () => {
  it("has 12 styles with unique ids, a recipe, a valid group and register", () => {
    expect(DESIGN_STYLES).toHaveLength(12);
    const ids = DESIGN_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groupIds = new Set(STYLE_GROUPS.map((g) => g.id));
    for (const s of DESIGN_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.recipe.length).toBeGreaterThan(20);
      expect(groupIds.has(s.groupId)).toBe(true);
      expect(REGISTERS).toContain(s.register);
    }
  });

  it("groups the 6 use-cases, two individually-selectable styles each", () => {
    expect(STYLE_GROUPS).toHaveLength(6);
    for (const g of STYLE_GROUPS) {
      expect(g.useCase.length).toBeGreaterThan(0);
      expect(DESIGN_STYLES.filter((s) => s.groupId === g.id)).toHaveLength(2);
    }
    // The named styles the operator asked for are all present.
    const ids = new Set(DESIGN_STYLES.map((s) => s.id));
    for (const id of [
      "glassmorphism",
      "aurora",
      "bento",
      "minimalism",
      "neo-brutalism",
      "editorial",
      "dark-ui",
      "cyberpunk",
      "material",
      "card-ui",
      "claymorphism",
      "3d-illustration",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe("styleById / styleToRegister", () => {
  it("resolves a known id; null/undefined/unknown → undefined", () => {
    expect(styleById("glassmorphism")?.id).toBe("glassmorphism");
    expect(styleById(null)).toBeUndefined();
    expect(styleById(undefined)).toBeUndefined();
    expect(styleById("nope")).toBeUndefined();
  });

  it("maps every style to its register; auto (null) → undefined", () => {
    for (const s of DESIGN_STYLES) expect(styleToRegister(s.id)).toBe(s.register);
    expect(styleToRegister(null)).toBeUndefined();
    expect(styleToRegister("nope")).toBeUndefined();
  });
});

describe("randomStyleInGroup / resolveStyleSelection (category → hidden style)", () => {
  it("resolves a category to a concrete style WITHIN that group", () => {
    for (const g of STYLE_GROUPS) {
      const style = nn(randomStyleInGroup(g.id, 0));
      expect(style.groupId).toBe(g.id);
    }
  });

  it("미래지향 resolves to glassmorphism or aurora only", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 8; seed += 1) {
      seen.add(nn(randomStyleInGroup("futuristic", seed)).id);
    }
    expect([...seen].sort()).toEqual(["aurora", "glassmorphism"]);
  });

  it("is deterministic in the seed and re-rolls across seeds", () => {
    expect(randomStyleInGroup("futuristic", 3)?.id).toBe(randomStyleInGroup("futuristic", 3)?.id);
    // Adjacent seeds alternate the two members of a 2-style group.
    expect(randomStyleInGroup("futuristic", 0)?.id).not.toBe(
      randomStyleInGroup("futuristic", 1)?.id,
    );
  });

  it("unknown group → undefined", () => {
    expect(randomStyleInGroup("nope", 0)).toBeUndefined();
  });

  it("resolveStyleSelection: category → in-group style; legacy style id → that style; null → 자동", () => {
    expect(nn(resolveStyleSelection("saas", 0)).groupId).toBe("saas");
    // Back-compat: a stored concrete style id still resolves directly.
    expect(resolveStyleSelection("cyberpunk", 0)?.id).toBe("cyberpunk");
    expect(resolveStyleSelection(null, 0)).toBeUndefined();
    expect(resolveStyleSelection(undefined, 0)).toBeUndefined();
    expect(resolveStyleSelection("nope", 0)).toBeUndefined();
  });
});

describe("variationLine (within-style diversity)", () => {
  it("is deterministic in the seed and carries it", () => {
    expect(variationLine(5)).toBe(variationLine(5));
    expect(variationLine(5)).toContain("[이번 변주 #5]");
  });

  it("rotates knobs so consecutive seeds usually differ", () => {
    const strip = (n: number) => variationLine(n).replace(/#\d+/, "#");
    let differing = 0;
    for (let i = 0; i < 12; i += 1) if (strip(i) !== strip(i + 1)) differing += 1;
    expect(differing).toBeGreaterThanOrEqual(10);
  });

  // WI-233 — the structural variety formerly attempted by four weak adverbs
  // (비대칭/중앙/그리드/대각선) now rides the composition-archetype axis: every
  // variation line commits to a concrete MACRO composition that rotates per seed.
  it("carries the macro-composition archetype axis (structural diversity)", () => {
    expect(variationLine(5)).toContain("구도(매크로)");
    expect(variationLine(0)).toContain(archetypeForSeed(0).label);
    // the structural archetype changes between adjacent seeds.
    expect(variationLine(0)).not.toBe(variationLine(1).replace("#1", "#0"));
  });
});

describe("composeStyleTask", () => {
  it("emits a [디자인 스타일] block with the recipe, commit tail, and variation", () => {
    const style = nn(styleById("cyberpunk"));
    const line = composeStyleTask(style, 3);
    expect(line).toContain("[디자인 스타일]");
    expect(line).toContain(style.recipe);
    expect(line).toContain("끌려가지 마세요"); // commit tail
    expect(line).toContain("[이번 변주 #3]");
  });

  // WI-228 — the concrete design lock must be injected (not just prose), so the
  // agent applies exact palette/fonts/effects instead of guessing → converging.
  it("injects the concrete spec block with the style's literal palette + fonts", () => {
    const style = nn(styleById("cyberpunk"));
    const line = composeStyleTask(style, 3);
    expect(line).toContain("[디자인 스펙");
    expect(line).toContain(style.spec.bg); // #0a0e1a
    expect(line).toContain(style.spec.accent); // #ff2bd6
    expect(line).toContain(style.spec.accent2); // #00f0ff
    expect(line).toContain(style.spec.fonts.split(" ")[1] ?? ""); // a font family
  });
});

describe("StyleSpec concrete lock (WI-228)", () => {
  it("every style carries a complete concrete spec (no field left blank)", () => {
    const fields = [
      "bg",
      "surface",
      "accent",
      "accent2",
      "textStrong",
      "textBody",
      "line",
      "background",
      "shadow",
      "radius",
      "fonts",
      "effects",
    ] as const;
    for (const s of DESIGN_STYLES) {
      expect(s.spec, s.id).toBeDefined();
      for (const f of fields) {
        expect(typeof s.spec[f], `${s.id}.${f}`).toBe("string");
        expect(s.spec[f].length, `${s.id}.${f}`).toBeGreaterThan(0);
      }
      // The signature palette colours are literal CSS (hex / rgba / transparent),
      // never a var(--token) — the style must read the same regardless of theme.
      expect(s.spec.bg).not.toContain("var(");
      expect(s.spec.accent).not.toContain("var(");
    }
  });

  it("auto catalog carries a one-line concrete signature per style (palette + font)", () => {
    const dir = autoStyleDirective(1);
    for (const s of DESIGN_STYLES) {
      expect(dir, s.id).toContain(s.spec.bg);
      expect(dir, s.id).toContain(s.spec.accent);
    }
  });
});

describe("autoStyleDirective (content-aware)", () => {
  it("asks the agent to analyze content and lists every use-case + style label", () => {
    const dir = autoStyleDirective(1);
    expect(dir).toContain("[디자인 스타일: 자동]");
    expect(dir).toContain("콘텐츠");
    for (const g of STYLE_GROUPS) expect(dir).toContain(g.useCase);
    for (const s of DESIGN_STYLES) expect(dir).toContain(s.label);
  });
});
