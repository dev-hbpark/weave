// WI-183 — move-drag transform modifiers, composed as a decorator around the
// host's `FrameMoveSnap` (the same wrapping idiom WI-159 uses for the
// page-move group capture). Two behaviors, both 5-tool consensus
// (SLIDE_DECK_INTERACTION_SPEC §4 Batch 1):
//
//   • Shift + drag → AXIS LOCK: the minor axis of the raw delta is zeroed
//     BEFORE the snap engine sees it (the dominant axis is re-evaluated live
//     each move, so the lock can flip mid-drag — Figma behavior). Snapping
//     then operates on the locked delta, so guides stay consistent.
//   • Alt/Option + drag → DUPLICATE: at `begin` (the drag threshold, once per
//     gesture) the moving set is duplicated IN PLACE (offset 0); the ORIGINAL
//     keeps moving and stays selected, the copy holds the source position —
//     visually identical to Figma/Keynote's alt-drag-copy. Two history
//     entries (duplicate, then the move) — recorded in DR-119.
//
// Modifier state is read from `modifier-tracker.ts` because `snapDelta`
// receives no event. `begin` consults Alt at the threshold moment only —
// pressing Alt mid-drag does not retro-duplicate (matches Figma).

import type { FrameMoveSnap } from "@agocraft/editor";
import type { LiveModifiers } from "./modifier-tracker.js";

export interface MoveModifierDeps {
  /** Live modifier read (usually `liveModifiers` from modifier-tracker). */
  readonly modifiers: () => LiveModifiers;
  /** Duplicate the moving set in place (offset 0) — the host wires this to
   *  `editor.exec("weave.items.duplicateInPlace", { itemIds })`. */
  readonly duplicateInPlace: (itemIds: ReadonlyArray<string>) => void;
}

export function withMoveModifiers(inner: FrameMoveSnap, deps: MoveModifierDeps): FrameMoveSnap {
  return {
    begin(primaryItemId, movingItemIds): void {
      if (deps.modifiers().alt) {
        deps.duplicateInPlace(movingItemIds.map(String));
      }
      inner.begin(primaryItemId, movingItemIds);
    },
    snapDelta(dxViewport, dyViewport) {
      let dx = dxViewport;
      let dy = dyViewport;
      if (deps.modifiers().shift) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      return inner.snapDelta(dx, dy);
    },
    end(): void {
      inner.end();
    },
  };
}
