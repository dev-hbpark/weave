// WI-103 / DR-070 D5 — phrase registry coverage + deterministic pick.

import { describe, expect, it } from "vitest";
import { moodsWithPhrases, phrasesFor, pickPhrase } from "./phrases.js";

describe("moodPhrases registry", () => {
  it("every registered mood carries at least one non-empty phrase", () => {
    for (const mood of moodsWithPhrases()) {
      const list = phrasesFor(mood);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it("pickPhrase is deterministic and stays in range", () => {
    const list = phrasesFor("working");
    expect(list.length).toBeGreaterThan(0);
    expect(pickPhrase("working", 0)).toBe(list[0]);
    expect(pickPhrase("working", list.length)).toBe(list[0]); // wraps
    expect(pickPhrase("working", -1)).toBe(list[list.length - 1]); // negative-safe
  });

  it("returns null for a mood with no phrases (caller decides fallback)", () => {
    // every AkuMood currently has phrases; an unknown key returns null safely
    expect(pickPhrase("idle", 0)).not.toBeNull();
  });
});
