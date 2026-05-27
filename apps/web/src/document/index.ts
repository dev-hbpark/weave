export { BehaviorEditor } from "./BehaviorEditor.js";
export {
  cameraTargetAdapter,
  createInteractionRegistry,
  firstChildOf,
  hotspotAdapter,
  type InteractionAdapter,
  type InteractionMode,
  InteractionModeProvider,
  type InteractionRegistry,
  interactionRegistry,
  nextSiblingOf,
  PeekActiveProvider,
  type PresentContext,
  type PresentEvent,
  parentOf,
  prevSiblingOf,
  revealOnStepAdapter,
  type Selection,
  SelectionProvider,
  useEditAffordancesAllowed,
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useInteractionMode,
  usePeekActive,
  useRubberBandAllowed,
  useSelection,
  useSelectionChromeVisible,
  useTooltipsAllowed,
} from "./interactions/index.js";
export {
  collectPresentationIds,
  effectivePresentationOrder,
  FRAME_KINDS,
  reconcilePresentationOrder,
  reorder,
} from "./presentation-order.js";
export { createDefaultItem, tileFrame } from "./seed.js";
export {
  clearDesign,
  createBlankDesign,
  loadDesign,
  saveDesign,
} from "./storage.js";
// Phase 6 — local `Document` and `Item<K>` types are no longer part of the
// public barrel. New code uses `AgoItem<K>` (typed agocraft view) + the
// canonical agocraft Document. The weave-shape types remain inside
// `./types.js` for `seed.ts` / `commands.ts` / legacy storage migrations
// only — import directly from there when you genuinely need them.
export type {
  AgoItem,
  BlockDocAttrs,
  ButtonTriggerBehavior,
  CameraTargetBehavior,
  CanvasAttrs,
  Design,
  DocFlavor,
  DocFlavorMeta,
  DocSizePreset,
  DomainKind,
  DomainMeta,
  EntranceAnimationBehavior,
  HotspotAction,
  HotspotBehavior,
  HoverEffectBehavior,
  InteractionBehavior,
  ItemAttrsByKind,
  ItemFrame,
  MediaAttrs,
  RevealOnStepBehavior,
  SlideAttrs,
} from "./types.js";
export {
  DOC_FLAVORS,
  DOC_SIZE_PRESETS,
  DOMAIN_KINDS,
  DOMAIN_REGISTRY,
  FLAVOR_REGISTRY,
  FULL_FRAME,
} from "./types.js";
export { useDesign } from "./use-design.js";
