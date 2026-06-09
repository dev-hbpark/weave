import { describe, expect, it } from "vitest";
import { FORMAT_EDITOR_CONFIG, formatEditorConfig } from "./format-editor-config.js";
import type { DocFlavor } from "./types.js";

describe("FORMAT_EDITOR_CONFIG (WI-153 / DR-111)", () => {
  it("mixed and canvas-board are infinite canvases (free placement)", () => {
    expect(formatEditorConfig("mixed").canvas).toBe("infinite");
    expect(formatEditorConfig("canvas-board").canvas).toBe("infinite");
  });

  it("slide-deck and doc-page are page-bounded (Canva-style)", () => {
    expect(formatEditorConfig("slide-deck").canvas).toBe("page-bounded");
    expect(formatEditorConfig("doc-page").canvas).toBe("page-bounded");
  });

  it("reproduces the prior `infiniteCanvas` boolean exactly", () => {
    // Prior: infiniteCanvas = flavor === "mixed" || flavor === "canvas-board".
    const flavors: DocFlavor[] = ["mixed", "slide-deck", "canvas-board", "doc-page"];
    for (const f of flavors) {
      const prior = f === "mixed" || f === "canvas-board";
      expect(formatEditorConfig(f).canvas === "infinite").toBe(prior);
    }
  });

  it("defaults an undefined/legacy flavor to the infinite mixed policy", () => {
    expect(formatEditorConfig(undefined).canvas).toBe("infinite");
    // an unknown value (legacy doc) falls back rather than crashing
    expect(formatEditorConfig("legacy-unknown" as DocFlavor).canvas).toBe("infinite");
  });

  it("covers every DocFlavor (exhaustive registry)", () => {
    const flavors: DocFlavor[] = ["mixed", "slide-deck", "canvas-board", "doc-page"];
    for (const f of flavors) expect(FORMAT_EDITOR_CONFIG[f]).toBeDefined();
  });
});
