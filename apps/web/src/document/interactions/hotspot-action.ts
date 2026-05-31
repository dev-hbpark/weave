// AUDIT-005 (task #6) — single declarative dispatcher for `HotspotAction`.
// Replaces the two duplicated action-type switch blocks (hotspot present
// adapter + PresentPage button-trigger). Dispatch is an exhaustive, mapped-type
// lookup over `HotspotAction["type"]` — the compiler enforces totality, so this
// is Rule 6's permitted "lookup table" form (no in-body switch / else-if, no
// open kind→behavior catalogue). Call sites supply a `HotspotActionContext`
// that adapts their runtime (PresentContext vs PresentPage closures) to the
// four intrinsic operations.

import type { HotspotAction } from "../types.js";

export interface HotspotActionContext {
  /** Reveal a hidden element / step target by id. */
  reveal(targetId: string): void;
  /** Advance to the next scene (clamped by the caller). */
  nextStep(): void;
  /** Jump to a specific camera / scene by id. */
  jumpToCamera(targetId: string): void;
  /** Open an external URL (caller decides the window guard). */
  openExternal(href: string): void;
}

type HotspotActionHandlers = {
  [T in HotspotAction["type"]]: (
    action: Extract<HotspotAction, { type: T }>,
    ctx: HotspotActionContext,
  ) => void;
};

const HANDLERS: HotspotActionHandlers = {
  reveal: (action, ctx) => ctx.reveal(action.targetId),
  "next-camera": (_action, ctx) => ctx.nextStep(),
  "jump-camera": (action, ctx) => ctx.jumpToCamera(action.targetId),
  external: (action, ctx) => ctx.openExternal(action.href),
};

/** Resolve + run the handler for an action. The cast bridges the per-type
 *  narrowing the exhaustive map already guarantees. */
export function dispatchHotspotAction(action: HotspotAction, ctx: HotspotActionContext): void {
  (HANDLERS[action.type] as (a: HotspotAction, c: HotspotActionContext) => void)(action, ctx);
}

/** Shared `openExternal` — both call sites guarded `window` identically. */
export function openExternalHref(href: string): void {
  if (typeof window !== "undefined") {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}
