import { describe, expect, it } from "vitest";
import { AKU_STYLES, nextAutoStyle, styleById, styleTaskLine } from "./aku-styles.js";

describe("AKU_STYLES catalog", () => {
  it("has several distinct tones with unique ids and non-empty prompts", () => {
    expect(AKU_STYLES.length).toBeGreaterThanOrEqual(5);
    const ids = AKU_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    for (const s of AKU_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.prompt.length).toBeGreaterThan(10);
    }
  });
});

describe("styleById", () => {
  it("resolves a known id and returns undefined for null/unknown", () => {
    expect(styleById(AKU_STYLES[0]?.id)?.id).toBe(AKU_STYLES[0]?.id);
    expect(styleById(null)).toBeUndefined();
    expect(styleById(undefined)).toBeUndefined();
    expect(styleById("does-not-exist")).toBeUndefined();
  });
});

describe("styleTaskLine", () => {
  it("returns '' for no style and a [디자인 톤] block with the commit tail otherwise", () => {
    expect(styleTaskLine(undefined)).toBe("");
    const line = styleTaskLine(AKU_STYLES[0]);
    expect(line).toContain("[디자인 톤]");
    expect(line).toContain(AKU_STYLES[0]!.prompt);
    // The commit tail steers away from the active theme's default look.
    expect(line).toContain("끌려가지 마세요");
  });
});

describe("nextAutoStyle rotation", () => {
  it("advances every call and cycles through the whole catalog without repeats", () => {
    const cursor = { value: 0 };
    const seen = AKU_STYLES.map(() => nextAutoStyle(cursor).id);
    expect(new Set(seen).size).toBe(AKU_STYLES.length); // full coverage, no repeat in one cycle
    expect(cursor.value).toBe(AKU_STYLES.length);
  });

  it("consecutive auto picks differ (variety guarantee)", () => {
    const cursor = { value: 3 };
    let prev = nextAutoStyle(cursor).id;
    for (let i = 0; i < 12; i += 1) {
      const cur = nextAutoStyle(cursor).id;
      expect(cur).not.toBe(prev);
      prev = cur;
    }
  });

  it("handles a large seeded start without going out of range", () => {
    const cursor = { value: 996 };
    const s = nextAutoStyle(cursor);
    expect(AKU_STYLES).toContainEqual(s);
  });
});
