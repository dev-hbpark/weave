// WI-239 Phase 1 — tool registry + strategy behavior.

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INK_TOOL_ID,
  INK_TOOL_ORDER,
  type InkToolContext,
  inkTool,
  isDrawTool,
} from "./ink-tools.js";
import type { InkStrokeStyle } from "./types.js";

const STYLE: InkStrokeStyle = { color: "#000", width: 4, opacity: 1, blend: "normal" };

function ctx(overrides: Partial<InkToolContext> = {}): InkToolContext {
  return {
    point: { x: 0, y: 0 },
    style: STYLE,
    pressed: false,
    beginDraft: vi.fn(),
    extendDraft: vi.fn(),
    commitDraft: vi.fn(),
    eraseAt: vi.fn(),
    ...overrides,
  };
}

describe("ink-tools registry", () => {
  it("resolves every ordered id and falls back to pen for unknowns", () => {
    for (const id of INK_TOOL_ORDER) expect(inkTool(id).id).toBe(id);
    expect(inkTool("nope").id).toBe(DEFAULT_INK_TOOL_ID);
  });

  it("classifies draw vs erase tools", () => {
    expect(isDrawTool("pen")).toBe(true);
    expect(isDrawTool("highlighter")).toBe(true);
    expect(isDrawTool("eraser")).toBe(false);
  });

  it("highlighter is translucent multiply; pen is opaque", () => {
    expect(inkTool("highlighter").defaultStyle.blend).toBe("multiply");
    expect(inkTool("highlighter").defaultStyle.opacity).toBeLessThan(1);
    expect(inkTool("pen").defaultStyle.opacity).toBe(1);
    expect(inkTool("pen").defaultStyle.blend).toBe("normal");
  });
});

describe("draw tool strategy (pen)", () => {
  it("down begins a draft; move extends only while pressed; up commits", () => {
    const pen = inkTool("pen");
    const c1 = ctx();
    pen.onDown(c1);
    expect(c1.beginDraft).toHaveBeenCalledOnce();

    const cMoveUp = ctx({ pressed: false });
    pen.onMove(cMoveUp);
    expect(cMoveUp.extendDraft).not.toHaveBeenCalled();

    const cMoveDown = ctx({ pressed: true });
    pen.onMove(cMoveDown);
    expect(cMoveDown.extendDraft).toHaveBeenCalledOnce();

    const cUp = ctx();
    pen.onUp(cUp);
    expect(cUp.commitDraft).toHaveBeenCalledOnce();
  });
});

describe("erase tool strategy", () => {
  it("erases on down and on pressed-move, not on hover-move or up", () => {
    const er = inkTool("eraser");
    const cDown = ctx();
    er.onDown(cDown);
    expect(cDown.eraseAt).toHaveBeenCalledOnce();

    const cHover = ctx({ pressed: false });
    er.onMove(cHover);
    expect(cHover.eraseAt).not.toHaveBeenCalled();

    const cDrag = ctx({ pressed: true });
    er.onMove(cDrag);
    expect(cDrag.eraseAt).toHaveBeenCalledOnce();

    const cUp = ctx();
    er.onUp(cUp);
    expect(cUp.eraseAt).not.toHaveBeenCalled();
  });
});
