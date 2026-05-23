import type { RevealOnStepBehavior } from "../types.js";
import type { InteractionAdapter } from "./types.js";

/** reveal-on-step adapter — Phase 2 of WI-009.
 *
 *  The item is hidden until the active camera-target step reaches `behavior.step`.
 *  PresentPage already AND's `shouldRender` across all adapters for an item and
 *  fades the wrapper to opacity 0 when any adapter says hidden. Pure decision —
 *  no overlay, no event handler.
 *
 *  Extension-point demo: registering this adapter does NOT touch PresentPage.tsx,
 *  Stage.tsx, or Hotspot.tsx — proves DR-009's open-registry promise.
 */
export const revealOnStepAdapter: InteractionAdapter<RevealOnStepBehavior> = {
  kind: "reveal-on-step",
  validate: (behavior) => {
    if (!Number.isInteger(behavior.step) || behavior.step < 0) {
      throw new Error(`reveal-on-step ${behavior.id}: step must be a non-negative integer`);
    }
  },
  shouldRender: (behavior, _item, ctx) => ctx.step >= behavior.step,
};
