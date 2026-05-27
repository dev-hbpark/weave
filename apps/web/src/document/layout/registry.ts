// WI-042 / WI-019 B6 — weave-side layout registry singleton.
//
// One LayoutRegistry per browser tab — lazily constructed, pre-registered
// with the v1 `absolute-constraints` adapter. The frame-resize command
// pulls this via `getLayoutRegistry()` and feeds it to
// `computeLayoutPatchesOnParentResize` so child rects ride alongside the
// parent's `item.attrs` Patch in a single transaction (Cmd+Z restores both).
//
// `WI019_LAYOUT_ENABLED` is the trunk-merge feature flag — default `false`
// during the LG-001 stabilisation window so the new code path stays dark
// until weave-side e2e + a11y land. Flip to `true` post-LG-001 after staging
// signal is clean (RISK-001 C3.1 condition).

import { createAbsoluteConstraintsAdapter, createLayoutRegistry, type LayoutRegistry } from "@agocraft/layout";

/** Default-off feature flag — see RISK-001 C3.1. */
export const WI019_LAYOUT_ENABLED = false;

let cached: LayoutRegistry | undefined;

/** Returns the lazily-initialised LayoutRegistry. Subsequent calls return
 *  the same instance; safe across the whole tab's React tree. */
export function getLayoutRegistry(): LayoutRegistry {
  if (cached === undefined) {
    cached = createLayoutRegistry();
    cached.register(createAbsoluteConstraintsAdapter());
  }
  return cached;
}
