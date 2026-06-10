import { buttonTriggerAdapter } from "./button-trigger.js";
import { cameraTargetAdapter } from "./camera-target.js";
import { hotspotAdapter } from "./hotspot.js";
import { createInteractionRegistry } from "./registry.js";
import { revealOnStepAdapter } from "./reveal-on-step.js";

export { buttonTriggerAdapter } from "./button-trigger.js";
export { cameraTargetAdapter } from "./camera-target.js";
export { hotspotAdapter } from "./hotspot.js";
export {
  type InteractionMode,
  InteractionModeProvider,
  PeekActiveProvider,
  useEditAffordancesAllowed,
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useInteractionMode,
  usePeekActive,
  useRubberBandAllowed,
  useSelectionChromeVisible,
  useTooltipsAllowed,
} from "./interaction-mode.js";
export { PresentRuntimeProvider, usePresentRuntime } from "./present-runtime-context.js";
export { createInteractionRegistry } from "./registry.js";
export { revealOnStepAdapter } from "./reveal-on-step.js";
export {
  firstChildOf,
  nextSiblingOf,
  parentOf,
  prevSiblingOf,
  type Selection,
  SelectionProvider,
  useSelection,
} from "./selection-context.js";
export type {
  InteractionAdapter,
  InteractionRegistry,
  PresentContext,
  PresentEvent,
} from "./types.js";

/** Singleton — extension point. Future plugins register here. */
export const interactionRegistry = createInteractionRegistry();
interactionRegistry.register(cameraTargetAdapter);
interactionRegistry.register(hotspotAdapter);
interactionRegistry.register(revealOnStepAdapter);
interactionRegistry.register(buttonTriggerAdapter);
