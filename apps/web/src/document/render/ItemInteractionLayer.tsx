import type { Item as AgocraftItem } from "@agocraft/core";
import { interactionRegistry } from "../interactions/index.js";
import { usePresentRuntime } from "../interactions/present-runtime-context.js";
import type { AgoItem } from "../types.js";

// WI-090 (DR-052 §3) — the single Present-mode consumer of the interaction
// registry. Given an item, it renders every behavior overlay the registry
// resolves for it (`button-trigger` link surface, `hotspot` sub-region, and
// any future kind that defines `renderOverlay`). Behaviors without an overlay
// (camera-target / reveal-on-step) contribute nothing here.
//
// Overlays are absolutely positioned (`inset:0` for button-trigger, region-based
// for hotspot), so the layer expects a positioned ancestor — which every
// `PresentFrameTree` host box already provides (the scene div / child wrapper).

export function ItemInteractionLayer({ item }: { readonly item: AgocraftItem }) {
  const ctx = usePresentRuntime();
  if (ctx === null) return null;
  const overlays = interactionRegistry
    .forItem(item as unknown as AgoItem)
    .map(({ behavior, adapter }) =>
      adapter.renderOverlay?.(behavior, item as unknown as AgoItem, ctx),
    )
    .filter((node) => node != null);
  if (overlays.length === 0) return null;
  return <>{overlays}</>;
}
