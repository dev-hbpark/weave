import type { Document as AgocraftDocument } from "@agocraft/core";
import type { InteractionAdapter as AgocraftInteractionAdapter } from "@agocraft/interaction";
import type { ReactNode } from "react";
import type { AgoItem, CameraTargetBehavior, InteractionBehavior } from "../types.js";

/** Public events the adapter may react to. New event types extend this union. */
export type PresentEvent =
  | { readonly type: "step-changed"; readonly from: number; readonly to: number }
  | { readonly type: "hotspot-click"; readonly itemId: string; readonly hotspotId: string }
  | { readonly type: "key"; readonly key: string };

/** Read-only handle into PresentPage's reducer — adapters never mutate state directly.
 *  Phase 5 — `doc` is the agocraft Document and `cameraTargets[].item` carries
 *  the agocraft-shaped `AgoItem`. Adapters can read `getBehaviors(item)` /
 *  `item.attrs` directly without any weave-shape projection. */
export interface PresentContext {
  readonly doc: AgocraftDocument;
  readonly step: number;
  readonly totalSteps: number;
  readonly cameraTargets: ReadonlyArray<{
    readonly item: AgoItem;
    readonly behavior: CameraTargetBehavior;
  }>;
  readonly revealed: ReadonlySet<string>;
  readonly goToStep: (step: number) => void;
  readonly goToCameraId: (id: string) => void;
  readonly reveal: (targetId: string) => void;
  readonly close: () => void;
}

/** Adapter contract — each InteractionKind defines one of these and registers it.
 *
 *  Phase 5 — `item` is the agocraft-shaped `AgoItem` (no more weave Item).
 *  Adapters that need behaviors read them via `getBehaviors(item)`; PresentPage
 *  iterates `docInAgocraft.root.children` directly so there's no projection
 *  layer between renderer and adapter. */
export interface InteractionAdapter<B extends InteractionBehavior = InteractionBehavior>
  extends Omit<AgocraftInteractionAdapter, "order" | "validate"> {
  readonly kind: B["kind"];
  /** Order in sequential navigation. Only camera-target needs this in PoC. */
  readonly getOrder?: (behavior: B, item: AgoItem, doc: AgocraftDocument) => number | undefined;
  /** Validate payload — throw to reject. Used by editor on commit. */
  readonly validate?: (behavior: B) => void;
  /** Overlay rendered in Present mode on top of the item. Click handlers, indicators, etc. */
  readonly renderOverlay?: (behavior: B, item: AgoItem, ctx: PresentContext) => ReactNode;
  /** Multiple adapters' decisions are AND'd. Return false to hide the item at this step.
   *  Used by reveal-on-step; future kinds (e.g., "hide-after-step") use the same hook. */
  readonly shouldRender?: (behavior: B, item: AgoItem, ctx: PresentContext) => boolean;
  /** Receive every PresentEvent. Use for cross-behavior reactions. */
  readonly onEvent?: (behavior: B, item: AgoItem, ctx: PresentContext, ev: PresentEvent) => void;
}

/** Project a weave `InteractionAdapter<B>` down to the abstract shape so it
 *  can be registered on `editor.interactions`. The abstract surface keeps
 *  only `kind` (and an unknown-typed `validate` / `order` if the weave
 *  adapter chose to forward those). Renderers / present-mode hooks stay on
 *  the weave-local registry; the agocraft mirror is for plugins / devtools. */
export function toAgocraftInteractionAdapter<B extends InteractionBehavior>(
  weaveAdapter: InteractionAdapter<B>,
): AgocraftInteractionAdapter {
  return {
    kind: weaveAdapter.kind,
    ...(weaveAdapter.validate !== undefined
      ? { validate: (behavior: unknown) => weaveAdapter.validate?.(behavior as B) }
      : {}),
  };
}

export interface InteractionRegistry {
  readonly register: <B extends InteractionBehavior>(adapter: InteractionAdapter<B>) => () => void;
  readonly get: (kind: InteractionBehavior["kind"]) => InteractionAdapter | undefined;
  readonly list: () => ReadonlyArray<InteractionAdapter>;
  /** All behaviors on an item, paired with their adapter. Behaviors with no adapter are skipped + warned. */
  readonly forItem: (
    item: AgoItem,
    kindFilter?: InteractionBehavior["kind"],
  ) => ReadonlyArray<{ behavior: InteractionBehavior; adapter: InteractionAdapter }>;
}
