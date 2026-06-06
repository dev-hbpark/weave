import { describe, expect, it } from "vitest";
import {
  autoStyleDirective,
  composeStyleTask,
  DESIGN_STYLES,
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
});

describe("composeStyleTask", () => {
  it("emits a [디자인 스타일] block with the recipe, commit tail, and variation", () => {
    const style = styleById("cyberpunk")!;
    const line = composeStyleTask(style, 3);
    expect(line).toContain("[디자인 스타일]");
    expect(line).toContain(style.recipe);
    expect(line).toContain("끌려가지 마세요"); // commit tail
    expect(line).toContain("[이번 변주 #3]");
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
