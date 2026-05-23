import { createInteractionRegistry } from "@agocraft/interaction";
import { describe, expect, it, vi } from "vitest";
import { type InteractionAdapter, toAgocraftInteractionAdapter } from "./types.js";
import type { HotspotBehavior } from "../types.js";

describe("toAgocraftInteractionAdapter", () => {
  it("preserves the kind and registers cleanly on agocraft's registry", () => {
    const weave: InteractionAdapter<HotspotBehavior> = {
      kind: "hotspot",
    };
    const projected = toAgocraftInteractionAdapter(weave);
    expect(projected.kind).toBe("hotspot");
    const reg = createInteractionRegistry();
    reg.register(projected);
    expect(reg.get("hotspot")).toBe(projected);
  });

  it("forwards the validate hook from weave to the abstract surface", () => {
    const validate = vi.fn();
    const weave: InteractionAdapter<HotspotBehavior> = {
      kind: "hotspot",
      validate,
    };
    const projected = toAgocraftInteractionAdapter(weave);
    expect(projected.validate).toBeDefined();
    projected.validate?.({ kind: "hotspot" });
    expect(validate).toHaveBeenCalledOnce();
  });

  it("omits validate when the source adapter doesn't declare one", () => {
    const weave: InteractionAdapter<HotspotBehavior> = { kind: "hotspot" };
    const projected = toAgocraftInteractionAdapter(weave);
    expect(projected.validate).toBeUndefined();
  });
});
