// WI-249 / DR-164 — relayout effect.
//
// Reacts to `item.attrs` patches that change an item's SIZE (width/height/
// rotation) and derives the LayoutEngine reflow patches — the cross-cutting
// "geometry changed → relayout its parent's layout" consequence that
// `computeAttrsPatches` used to hand-append inline. Behaviour-neutral: same
// guard (LAYOUT_FEATURE_ENABLED + size change), same `onFrameChanged` call,
// same source frames (patch.before.frame / patch.after.frame).

import type { BuiltinItemFrame as ItemFrame, Patch } from "@agocraft/core";
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "../layout/registry.js";
import { ok } from "../result.js";
import type { TransactionEffect } from "./transaction-effect.js";

const sizeChanged = (a: ItemFrame | undefined, b: ItemFrame | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  (a.width !== b.width || a.height !== b.height || (a.rotation ?? 0) !== (b.rotation ?? 0));

export const relayoutEffect: TransactionEffect = {
  name: "relayout",
  reactsTo: ["item.attrs"],
  // WI-250 / DR-166 — this IS the engine reflow (same `onFrameChanged` call a
  // self-reflowing command performs inline). Suppressed by the central runner
  // when the command already emitted engine-derived reflow patches, so add /
  // reparent / resizeHug / items.update do not double-reflow.
  skipWhenSelfReflowed: true,
  derive(ctx, patches, meta) {
    if (!LAYOUT_FEATURE_ENABLED) return ok([]);
    const out: Patch[] = [];
    for (const p of patches) {
      if ((p as { type?: string }).type !== "item.attrs") continue;
      const oldFrame = (p as { before?: { frame?: ItemFrame } }).before?.frame;
      const newFrame = (p as { after?: { frame?: ItemFrame } }).after?.frame;
      // WI-224 — only a SIZE change re-lays-out children; a position-only move
      // travels children with the parent (no reflow).
      if (oldFrame === undefined || newFrame === undefined || !sizeChanged(oldFrame, newFrame)) {
        continue;
      }
      const engine = getLayoutEngine();
      out.push(
        ...(engine.onFrameChanged({
          root: ctx.document.root,
          itemId: (p as { itemId: unknown }).itemId,
          oldFrame,
          newFrame,
          ...(meta.sessionId !== undefined ? { gestureId: meta.sessionId } : {}),
          ...(meta.designWidth !== undefined ? { designWidth: meta.designWidth } : {}),
          ...(meta.designHeight !== undefined ? { designHeight: meta.designHeight } : {}),
        } as Parameters<typeof engine.onFrameChanged>[0]) as ReadonlyArray<Patch>),
      );
    }
    return ok(out);
  },
};
