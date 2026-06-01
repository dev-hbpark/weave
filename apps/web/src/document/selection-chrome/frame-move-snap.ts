// WI-073 — weave's FrameMoveSnap: the host side of agocraft's move-drag snap
// (DR-036). On drag start it gathers VIEWPORT-px rects from the DOM
// (`[data-frame-id]` elements) — the moving frame, the candidate items to align
// to, and the parent frame / canvas as the bounds container — and hands them to
// agocraft's `createMoveSnap` (which owns all the geometry + the engine). Each
// move maps the raw viewport delta to the snap-corrected one; guides are pushed
// to the `snapFeedback` store and drawn by `SnapFeedbackLayer`.
//
// Rects are captured ONCE at `begin` (candidate / container geometry is static
// for the gesture; `createMoveSnap` translates the moving rect by the delta).

import { createMoveSnap, type MoveSnap, type SnapRect } from "@agocraft/core";
import type { FrameMoveSnap } from "@agocraft/editor";
import { snapFeedback } from "./snap-feedback.js";

function rectOf(el: Element): SnapRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export interface FrameMoveSnapDeps {
  /** The design-plane host element — the bounds container for a TOP-LEVEL frame
   *  (one with no parent `[data-frame-id]`). */
  readonly hostEl: () => Element | null;
  /** Snap tolerance (px). Default = the engine's 6px. */
  readonly tolerancePx?: number;
}

export function createFrameMoveSnap(deps: FrameMoveSnapDeps): FrameMoveSnap {
  let active: MoveSnap | null = null;

  return {
    begin(primaryItemId): void {
      active = null;
      if (typeof document === "undefined") return;
      const movingEl = document.querySelector(
        `[data-frame-id="${CSS.escape(String(primaryItemId))}"]`,
      );
      if (!(movingEl instanceof HTMLElement)) return;

      // Candidates = every other frame-bearing element that is neither an
      // ancestor nor a descendant of the moving one (self excluded by both
      // `contains` checks). `el.contains(el)` is true, so this drops self too.
      const candidates: SnapRect[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-frame-id]")) {
        if (el.contains(movingEl) || movingEl.contains(el)) continue;
        candidates.push(rectOf(el));
      }

      // Bounds container = the nearest ancestor frame, or the design host for a
      // top-level frame.
      const parentFrame = movingEl.parentElement?.closest<HTMLElement>("[data-frame-id]") ?? null;
      const containerEl = parentFrame ?? deps.hostEl();
      const container = containerEl !== null ? rectOf(containerEl) : null;

      active = createMoveSnap({
        movingRectAtStart: rectOf(movingEl),
        candidates,
        container,
        ...(deps.tolerancePx !== undefined
          ? { options: { lineTolerancePx: deps.tolerancePx } }
          : {}),
        publishGuides: (guides) => {
          snapFeedback.set({ dx: 0, dy: 0, hits: [], guides });
        },
      });
    },
    snapDelta(dxViewport, dyViewport) {
      return active !== null
        ? active.snapDelta(dxViewport, dyViewport)
        : { dx: dxViewport, dy: dyViewport };
    },
    end(): void {
      active?.clear();
      active = null;
      snapFeedback.clear();
    },
  };
}
