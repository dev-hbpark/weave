import { cameraTargetAdapter } from "./camera-target.js";
import { hotspotAdapter } from "./hotspot.js";
import { createInteractionRegistry } from "./registry.js";
import { revealOnStepAdapter } from "./reveal-on-step.js";

export { cameraTargetAdapter } from "./camera-target.js";
export { hotspotAdapter } from "./hotspot.js";
export { createInteractionRegistry } from "./registry.js";
export { revealOnStepAdapter } from "./reveal-on-step.js";
export type {
  InteractionAdapter,
  InteractionRegistry,
  PresentContext,
  PresentEvent,
} from "./types.js";
export {
  type InteractionMode,
  InteractionModeProvider,
  useFrameSelectionAllowed,
  useInteractionMode,
  useRubberBandAllowed,
  useTooltipsAllowed,
} from "./interaction-mode.js";
export {
  type ClickIntent,
  firstChildOf,
  nextSiblingOf,
  parentOf,
  prevSiblingOf,
  type Selection,
  SelectionProvider,
  selectFromHit,
  useSelection,
} from "./selection-context.js";

/** Singleton — extension point. Future plugins register here. */
export const interactionRegistry = createInteractionRegistry();
interactionRegistry.register(cameraTargetAdapter);
interactionRegistry.register(hotspotAdapter);
interactionRegistry.register(revealOnStepAdapter);
