import type { Item } from "@agocraft/core";
import { createHandleGesture, type HandlePointer } from "@agocraft/editor";
import { describe, expect, it, vi } from "vitest";
import { HANDLE_INTERACTIONS } from "./handle-gesture-runner.js";

const NO_DOC = () => ({}) as unknown as Item;
const p = (x: number, y: number, alt = false): HandlePointer => ({
  clientX: x,
  clientY: y,
  altKey: alt,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
});

describe("HANDLE_INTERACTIONS registry (WI-067)", () => {
  it("registers every built-in handle interaction kind", () => {
    expect([...HANDLE_INTERACTIONS.list()].sort()).toEqual(
      ["discrete-action", "frame-resize", "frame-rotate", "vertex-drag", "vertex-insert"].sort(),
    );
  });

  it("drag kinds drive update on move + terminate on up", () => {
    for (const kind of ["vertex-drag", "vertex-insert", "frame-resize", "frame-rotate"]) {
      const interaction = HANDLE_INTERACTIONS.resolve(kind);
      expect(interaction, kind).toBeDefined();
      if (interaction === undefined) continue;
      const update = vi.fn();
      const g = createHandleGesture(
        interaction,
        { handleId: "h", itemId: "i", origin: p(0, 0), sink: { update }, params: {} },
        NO_DOC,
      );
      g.pointerMove(p(5, 5));
      g.pointerMove(p(9, 9));
      expect(update, kind).toHaveBeenCalledTimes(2);
      g.pointerUp(p(9, 9));
      expect(g.isDone(), kind).toBe(true);
    }
  });

  it("discrete-action fires on release, NOT on move", () => {
    const interaction = HANDLE_INTERACTIONS.resolve("discrete-action");
    expect(interaction).toBeDefined();
    if (interaction === undefined) return;
    const fire = vi.fn();
    const g = createHandleGesture(
      interaction,
      { handleId: "+", itemId: "slide", origin: p(0, 0), sink: { fire }, params: {} },
      NO_DOC,
    );
    g.pointerMove(p(1, 1));
    expect(fire).not.toHaveBeenCalled();
    g.pointerUp(p(0, 0));
    expect(fire).toHaveBeenCalledWith("activate", expect.objectContaining({ clientX: 0 }));
    expect(g.isDone()).toBe(true);
  });

  it("discrete-action aborts on Escape without firing", () => {
    const interaction = HANDLE_INTERACTIONS.resolve("discrete-action");
    if (interaction === undefined) throw new Error("missing");
    const fire = vi.fn();
    const g = createHandleGesture(
      interaction,
      { handleId: "+", itemId: "slide", origin: p(0, 0), sink: { fire }, params: {} },
      NO_DOC,
    );
    g.keyDown("Escape");
    expect(fire).not.toHaveBeenCalled();
    expect(g.isDone()).toBe(true);
  });
});
