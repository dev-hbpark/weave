// WI-154 — the wizard → editor in-memory handoff. The contract under test:
// peek is NON-consuming (StrictMode double-render must both hit), and clear
// commits the one-shot so a reopen resolves through LS → cloud.

import { describe, expect, it } from "vitest";
import { clearNewDesign, peekNewDesign, stashNewDesign } from "./new-design-handoff.js";
import type { Design } from "./types.js";

const design = (id: string): Design => ({ id }) as Design;

describe("new-design-handoff", () => {
  it("peek returns the stashed design without consuming it", () => {
    stashNewDesign(design("d-peek"));
    expect(peekNewDesign("d-peek")?.id).toBe("d-peek");
    // Second render pass (StrictMode) must still hit.
    expect(peekNewDesign("d-peek")?.id).toBe("d-peek");
    clearNewDesign("d-peek");
  });

  it("clear commits the handoff — later opens miss", () => {
    stashNewDesign(design("d-clear"));
    clearNewDesign("d-clear");
    expect(peekNewDesign("d-clear")).toBeUndefined();
  });

  it("clear is idempotent and a never-stashed id misses", () => {
    expect(peekNewDesign("d-never")).toBeUndefined();
    clearNewDesign("d-never"); // no throw
  });

  it("stashes are keyed per design id", () => {
    stashNewDesign(design("d-a"));
    stashNewDesign(design("d-b"));
    expect(peekNewDesign("d-a")?.id).toBe("d-a");
    expect(peekNewDesign("d-b")?.id).toBe("d-b");
    clearNewDesign("d-a");
    expect(peekNewDesign("d-b")?.id).toBe("d-b");
    clearNewDesign("d-b");
  });
});
