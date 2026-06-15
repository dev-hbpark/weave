import { describe, expect, it } from "vitest";
import { WEAVE_TASK_PRIMER } from "./weave-capabilities.js";

// WI-231 / DR-146 — the per-task primer must steer the agent to INTERPRET tabular
// input into the representation that makes the point (chart / big number / diagram),
// and treat a literal grid table as the exception (lookup / explicit ask), not the
// default. This is the generation-time counterpart to the small-think CRITIQUE pass,
// which is skipped in openai/codex modes.
describe("WEAVE_TASK_PRIMER — data representation steering (WI-231/DR-146)", () => {
  it("tells the agent to interpret data, not transcribe it", () => {
    expect(WEAVE_TASK_PRIMER).toContain("INTERPRET DATA, DON'T TRANSCRIBE IT");
  });

  it("names the trend→line / comparison→bar / part-of-whole representation mapping", () => {
    expect(WEAVE_TASK_PRIMER).toMatch(/trend → line/);
    expect(WEAVE_TASK_PRIMER).toMatch(/comparison across categories → bar/);
    expect(WEAVE_TASK_PRIMER).toMatch(/part-of-whole/);
  });

  it("frames re-emitting a table as a grid as a DEFECT unless lookup / explicit request, and still mandates a grid (not flex rows) when one IS built", () => {
    expect(WEAVE_TASK_PRIMER).toMatch(/Re-emitting a table as a grid of cells is a DEFECT/);
    expect(WEAVE_TASK_PRIMER).toMatch(/WHEN a literal table IS the right call/);
    expect(WEAVE_TASK_PRIMER).toMatch(/auto-grid with explicit tracks, NEVER nested flex rows/);
  });

  it("places the interpret rule near the TOP (right after MOOD), before the build-a-grid mechanic", () => {
    const moodAt = WEAVE_TASK_PRIMER.indexOf("MOOD FIRST");
    const interpretAt = WEAVE_TASK_PRIMER.indexOf("INTERPRET DATA, DON'T TRANSCRIBE IT");
    const gridAt = WEAVE_TASK_PRIMER.indexOf("WHEN a literal table IS the right call");
    expect(moodAt).toBeGreaterThanOrEqual(0);
    expect(interpretAt).toBeGreaterThan(moodAt);
    expect(gridAt).toBeGreaterThan(interpretAt);
  });
});

// WI-234 / DR-149 — composition-quality steering: a card accent must belong to the
// card (decoration/child), not a free absolute sibling that drifts; and a sparse
// fixed-height card should hug its content, not be padded out with large/inconsistent
// gaps (the "absolute drift" + "region too big for the text" reports).
describe("WEAVE_TASK_PRIMER — accent-belongs-to-card + no whitespace padding (WI-234/DR-149)", () => {
  it("tells the agent a card accent/header strip must be the card's decoration or child, not a floating absolute sibling", () => {
    expect(WEAVE_TASK_PRIMER).toMatch(/ACCENT BELONGS TO ITS CARD/);
    expect(WEAVE_TASK_PRIMER).toMatch(/NEVER a separate absolute shape/);
    expect(WEAVE_TASK_PRIMER).toMatch(/DRIFTS/);
  });

  it("tells the agent to hug a sparse card's height and keep gap modest/consistent instead of padding whitespace", () => {
    expect(WEAVE_TASK_PRIMER).toMatch(/DON'T PAD A REGION WITH WHITESPACE/);
    expect(WEAVE_TASK_PRIMER).toMatch(/height:'hug'/);
    expect(WEAVE_TASK_PRIMER).toMatch(/gap MODEST and the SAME across sibling cards/);
  });
});
