import { createManipulationRegistry as createAgocraftRegistry } from "@agocraft/manipulation";
import { describe, expect, it, vi } from "vitest";
import { bridgeCanvasShapeIntoAgocraft } from "./agocraft-bridge.js";
import { createCanvasShapeCapability } from "./capabilities/canvas-shape.js";

const fakeShape = {
  id: "s-1",
  x: 10,
  y: 20,
  width: 30,
  height: 30,
  rotation: 0,
  hue: "var(--accent-strong)",
};

const target = {
  kind: "canvas-shape" as const,
  id: "s-1",
  itemId: "canvas-1",
  shape: fakeShape,
};

describe("bridgeCanvasShapeIntoAgocraft", () => {
  it("registers move / resize / rotate capabilities on the agocraft registry", () => {
    const updateShape = vi.fn();
    const removeShape = vi.fn();
    const weaveCap = createCanvasShapeCapability({ updateShape, removeShape });
    const agoReg = createAgocraftRegistry();
    bridgeCanvasShapeIntoAgocraft({
      weaveCanvasShape: weaveCap,
      agocraftRegistry: agoReg,
    });
    expect(agoReg.resolve("canvas-shape", "move")).toBeDefined();
    expect(agoReg.resolve("canvas-shape", "resize")).toBeDefined();
    expect(agoReg.resolve("canvas-shape", "rotate")).toBeDefined();
  });

  it("commit on the bridged move capability calls the weave apply", () => {
    const updateShape = vi.fn();
    const weaveCap = createCanvasShapeCapability({ updateShape, removeShape: vi.fn() });
    const agoReg = createAgocraftRegistry();
    bridgeCanvasShapeIntoAgocraft({ weaveCanvasShape: weaveCap, agocraftRegistry: agoReg });
    const move = agoReg.resolve("canvas-shape", "move");
    if (move === undefined) throw new Error("expected move capability");
    move.commit?.({ target, dx: 5, dy: -3 }, { target: target as never, scratch: {} });
    expect(updateShape).toHaveBeenCalledOnce();
    // The weave apply chooses the exact patch shape; we only assert that the
    // bridge ran the apply and the args reached `updateShape`.
    expect(updateShape).toHaveBeenCalledWith("canvas-1", "s-1", expect.any(Object));
  });

  it("teardown removes every registered bridged capability", () => {
    const weaveCap = createCanvasShapeCapability({ updateShape: vi.fn(), removeShape: vi.fn() });
    const agoReg = createAgocraftRegistry();
    const off = bridgeCanvasShapeIntoAgocraft({
      weaveCanvasShape: weaveCap,
      agocraftRegistry: agoReg,
    });
    off();
    expect(agoReg.resolve("canvas-shape", "move")).toBeUndefined();
    expect(agoReg.resolve("canvas-shape", "resize")).toBeUndefined();
    expect(agoReg.resolve("canvas-shape", "rotate")).toBeUndefined();
  });
});
