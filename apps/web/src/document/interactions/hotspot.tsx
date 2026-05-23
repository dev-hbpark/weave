import { Hotspot } from "@weave/design-system";
import type { HotspotBehavior } from "../types.js";
import type { InteractionAdapter, PresentContext } from "./types.js";

function dispatchAction(behavior: HotspotBehavior, ctx: PresentContext): void {
  switch (behavior.action.type) {
    case "reveal":
      ctx.reveal(behavior.action.targetId);
      return;
    case "next-camera":
      ctx.goToStep(Math.min(ctx.step + 1, ctx.totalSteps - 1));
      return;
    case "jump-camera":
      ctx.goToCameraId(behavior.action.targetId);
      return;
    case "external":
      if (typeof window !== "undefined") {
        window.open(behavior.action.href, "_blank", "noopener,noreferrer");
      }
      return;
  }
}

export const hotspotAdapter: InteractionAdapter<HotspotBehavior> = {
  kind: "hotspot",
  validate: (behavior) => {
    const { x, y, width, height } = behavior.region;
    for (const [name, v] of Object.entries({ x, y, width, height })) {
      if (!Number.isFinite(v)) {
        throw new Error(`hotspot ${behavior.id}: region.${name} must be finite`);
      }
    }
    if (width <= 0 || height <= 0) {
      throw new Error(`hotspot ${behavior.id}: region width/height must be > 0`);
    }
  },
  renderOverlay: (behavior, _item, ctx) => (
    <Hotspot
      key={behavior.id}
      region={behavior.region}
      label={behavior.label ?? "Hotspot"}
      onTrigger={() => dispatchAction(behavior, ctx)}
    />
  ),
};
