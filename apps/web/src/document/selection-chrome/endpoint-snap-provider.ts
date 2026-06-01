// WI-070 — first snap provider: an OPEN line's endpoint can snap onto its OWN
// opposite endpoint to close the path into a shape (fuse). The drag consumer
// (poly-vertex-handle) computes the drag-specific geometry it already owns —
// the opposite endpoint's live screen position + whether a fuse-close is legal —
// and hands it through `ctx.extra`; this provider just packages it as a radial
// `point` target tagged `opposite-endpoint`, so the engine and the feedback layer
// treat it uniformly with every future situation.
//
// Eligibility (decided by the consumer, surfaced via extra.snapClose):
//   • the dragged handle is an ENDPOINT being free-moved (Alt), and
//   • the line has ≥ 4 points (so fusing the two ends leaves a ≥ 3-vertex shape).
//
// Registered as a side effect on import (the host imports this module once).

import type { SnapProvider, SnapTarget } from "@agocraft/core";
import { SNAP_PROVIDERS } from "./snap-registry.js";

/** Shape the consumer puts on `SnapContext.extra` under `snapClose`. */
export interface EndpointSnapCloseExtra {
  /** Opposite endpoint, in screen px (the radial snap target). */
  readonly oppositeScreen: { readonly x: number; readonly y: number };
  /** Index of the opposite endpoint — drives the target-handle highlight. */
  readonly anchorIndex: number;
}

function readExtra(
  extra: Readonly<Record<string, unknown>> | undefined,
): EndpointSnapCloseExtra | null {
  const e = extra?.snapClose as EndpointSnapCloseExtra | undefined;
  if (
    e === undefined ||
    typeof e.anchorIndex !== "number" ||
    typeof e.oppositeScreen?.x !== "number" ||
    typeof e.oppositeScreen?.y !== "number"
  ) {
    return null;
  }
  return e;
}

export const endpointSnapProvider: SnapProvider = {
  id: "weave.endpoint-close",
  collect(ctx): ReadonlyArray<SnapTarget> {
    const e = readExtra(ctx.extra);
    if (e === null) return [];
    return [
      {
        kind: "point",
        at: e.oppositeScreen,
        source: {
          type: "opposite-endpoint",
          itemId: ctx.movingItemId,
          meta: { anchorIndex: e.anchorIndex },
        },
      },
    ];
  },
};

SNAP_PROVIDERS.register(endpointSnapProvider);
