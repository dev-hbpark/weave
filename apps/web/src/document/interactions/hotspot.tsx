import { Hotspot } from "@weave/design-system";
import type { HotspotBehavior } from "../types.js";
import { dispatchHotspotAction, openExternalHref } from "./hotspot-action.js";
import type { InteractionAdapter, PresentContext } from "./types.js";

function dispatchAction(behavior: HotspotBehavior, ctx: PresentContext): void {
  dispatchHotspotAction(behavior.action, {
    reveal: (id) => ctx.reveal(id),
    nextStep: () => ctx.goToStep(Math.min(ctx.step + 1, ctx.totalSteps - 1)),
    jumpToCamera: (id) => ctx.goToCameraId(id),
    openExternal: openExternalHref,
  });
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
