// WI-042 / WI-019 B6 + WI-020 B1-B6 — weave-side layout registry singleton.
//
// One LayoutRegistry per browser tab — lazily constructed, pre-registered
// with the v1 `absolute-constraints` adapter (+ v1.1 `auto-flex` and
// `auto-grid` when WI020_LAYOUT_VARIANTS_ENABLED). The frame-resize command
// pulls this via `getLayoutRegistry()` and feeds it to
// `computeLayoutPatchesOnParentResize` so child rects ride alongside the
// parent's `item.attrs` Patch in a single transaction (Cmd+Z restores both).
//
// Feature flag layering (RISK-002 C3.4 / C3.5 — independent rollback):
//
//   WI019_LAYOUT_ENABLED          — v1 absolute-constraints ripple on
//                                   parent resize. Off by default during
//                                   the LG-001 stabilisation window.
//   WI020_LAYOUT_VARIANTS_ENABLED — v1.1 auto-flex + auto-grid adapters
//                                   mounted. Independent from v1 so v1.1
//                                   can be turned off without breaking v1
//                                   consumers (RISK-002 C3.5).

import {
  createAbsoluteConstraintsAdapter,
  createAutoFlexAdapter,
  createAutoGridAdapter,
  createLayoutRegistry,
  type LayoutRegistry,
} from "@agocraft/layout";

/** Default-off feature flag for v1 absolute-constraints ripple — RISK-001 C3.1. */
export const WI019_LAYOUT_ENABLED = false;

/** Default-off feature flag for v1.1 auto-flex + auto-grid adapters.
 *  Independent from `WI019_LAYOUT_ENABLED` so rollback of v1.1 leaves v1
 *  intact (RISK-002 C3.5). Flip to `true` post-staging + axe smoke green. */
export const WI020_LAYOUT_VARIANTS_ENABLED = false;

let cached: LayoutRegistry | undefined;

/** Returns the lazily-initialised LayoutRegistry. Subsequent calls return
 *  the same instance; safe across the whole tab's React tree.
 *
 *  When `WI020_LAYOUT_VARIANTS_ENABLED` is on, auto-flex + auto-grid
 *  adapters are mounted alongside absolute-constraints. When off, the
 *  registry has only the v1 adapter — `LayoutRegistry.resolve("auto-flex")`
 *  returns `undefined`, and `computeLayoutPatchesOnParentResize` returns
 *  `[]` defensively (no behaviour change for v1 users). */
export function getLayoutRegistry(): LayoutRegistry {
  if (cached === undefined) {
    cached = createLayoutRegistry();
    cached.register(createAbsoluteConstraintsAdapter());
    if (WI020_LAYOUT_VARIANTS_ENABLED) {
      cached.register(createAutoFlexAdapter());
      cached.register(createAutoGridAdapter());
    }
  }
  return cached;
}
