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
  createLayoutEngine,
  createLayoutRegistry,
  type LayoutEngine,
  type LayoutRegistry,
} from "@agocraft/layout";

/** v1 absolute-constraints ripple on parent resize (RISK-001 C3.1).
 *  Enabled 2026-05-28 so frame resize propagates anchor-based child
 *  placement. The broader Operational Readiness items (e2e suite, axe
 *  smoke, LG, staging dogfood) remain deferred per the deferred-Ops
 *  policy — the flag turns the *behaviour* on; the gate work is separate. */
export const WI019_LAYOUT_ENABLED = true;

/** v1.1 auto-flex + auto-grid adapters. Independent from
 *  `WI019_LAYOUT_ENABLED` so rollback of v1.1 leaves v1 intact
 *  (RISK-002 C3.5). Enabled 2026-05-28 so Flex / Grid frames actually
 *  auto-arrange their children (registry mounts the adapters; the
 *  relayout-on-child-add wire in `commands.ts` runs). e2e + LG remain
 *  deferred per deferred-Ops. */
export const WI020_LAYOUT_VARIANTS_ENABLED = true;

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

/** Single host-side feature toggle for the agocraft LayoutEngine. The engine
 *  itself owns ALL layout behaviour; this flag only decides whether weave
 *  routes gestures through it at all (host policy, not layout logic). */
export const LAYOUT_FEATURE_ENABLED = WI019_LAYOUT_ENABLED || WI020_LAYOUT_VARIANTS_ENABLED;

let cachedEngine: LayoutEngine | undefined;

/** Returns the lazily-initialised agocraft LayoutEngine (WI-021). This is the
 *  ONLY layout entry point weave uses — every layout-driven mutation (child
 *  add, parent resize, paradigm change, child transform) and every
 *  manipulation constraint is computed by the engine. weave never branches
 *  on layout kind or shapes layout patches itself (library-ownership rule). */
export function getLayoutEngine(): LayoutEngine {
  if (cachedEngine === undefined) {
    cachedEngine = createLayoutEngine({ registry: getLayoutRegistry() });
  }
  return cachedEngine;
}
