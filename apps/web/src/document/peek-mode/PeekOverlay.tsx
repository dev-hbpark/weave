// WI-019 Phase 3 (revision 2) — PeekOverlay.
//
// Rev2 changes:
//   - REMOVED transparent placeholder boxes that mimicked frame positions.
//     The previous design rendered fake boxes that didn't match what the
//     user actually sees on screen.
//   - REAL frames now visually lift via CSS attribute selectors targeting
//     `[data-frame-id]` elements (set by FrameStage's NestedFrame). The
//     overlay's only responsibility is to:
//       (a) inject the lift/dim stylesheet,
//       (b) apply `data-peek-active` and per-frame `data-peek-lifted` +
//           `style.--peek-rank` markers via a DOM effect,
//       (c) render the cursor ring on top.
//   - Pointer events are deliberately none — the capture layer in DesignPage
//     owns event handling.

import { useEffect, useSyncExternalStore } from "react";
import type { PeekModeController } from "@agocraft/interaction";

export interface PeekOverlayProps {
  readonly controller: PeekModeController;
  /** The DOM element that contains all `[data-frame-id]` frames (typically
   *  the canvas-host `<main>`). The overlay sets `data-peek-active` on it
   *  while peek is on, which scopes the CSS rules below. */
  readonly canvasHost: HTMLElement | null;
  /** Cursor position in client-relative screen coords (already adjusted for
   *  the host element's bounding rect by the parent capture layer). */
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Optional — returns a CSS color string for an item id, mirroring the
   *  Inspector's swatchFor. When provided, the lifted frame's accent ring
   *  uses this color so the user can match a frame on the canvas to its
   *  Inspector row at a glance. */
  readonly colorFor?: (itemId: string) => string;
  /** Currently-dragging item id, or null when no drag is in progress. When
   *  set, the dragged frame keeps its own colorFor color (highlighted) and
   *  every OTHER lifted frame's border is dimmed to a neutral colour, so
   *  the user can tell exactly which card they have grabbed. */
  readonly draggingId?: string | null;
  /** Per-rank Z lift in design-space pixels. Default 60. */
  readonly zStep?: number;
}

const NEUTRAL_BORDER_COLOR = "rgba(255, 255, 255, 0.32)";

function useSignalValue<T>(sig: { get: () => T; subscribe: (h: (v: T) => void) => () => void }): T {
  return useSyncExternalStore(
    (cb) => sig.subscribe(() => cb()),
    () => sig.get(),
    () => sig.get(),
  );
}

const PEEK_STYLE_ID = "weave-peek-mode-styles";
const PEEK_STYLE_CSS = `
/* The peek-tilt container under the canvas-host gains a subtle 3D tilt
   when peek is active. */
[data-peek-tilt-target] {
  transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

/* For translateZ on lifted frames to actually produce a Z-depth shift
   (vs. being flattened back to 2D), every ancestor between the tilt
   target and the frame must establish a 3D context. */
[data-peek-active] [data-peek-tilt-target] *:not(svg, svg *) {
  transform-style: preserve-3d;
}

[data-peek-active] [data-frame-id] {
  transition:
    opacity 240ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 240ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 240ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 360ms cubic-bezier(0.34, 1.16, 0.64, 1);
  opacity: 0.32;
  filter: saturate(0.6) brightness(0.78);
}
[data-peek-active] [data-frame-id][data-peek-lifted] {
  opacity: 1;
  filter: none;
  z-index: var(--peek-z-index, 100);
  box-shadow:
    0 0 0 2.5px var(--peek-border-color, var(--accent)),
    0 0 0 6px color-mix(in srgb, var(--peek-border-color, var(--accent)) 28%, transparent),
    0 28px 56px -10px rgba(0, 0, 0, 0.6),
    0 10px 20px -4px rgba(0, 0, 0, 0.4);
}
[data-peek-active] [data-frame-id][data-peek-lifted][data-peek-dragging] {
  box-shadow:
    0 0 0 4px var(--peek-border-color, var(--accent)),
    0 0 0 11px color-mix(in srgb, var(--peek-border-color, var(--accent)) 44%, transparent),
    0 44px 80px -16px rgba(0, 0, 0, 0.75),
    0 16px 28px -6px rgba(0, 0, 0, 0.55);
  cursor: grabbing;
}
`;

function ensureStylesheetMounted(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(PEEK_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = PEEK_STYLE_ID;
  el.textContent = PEEK_STYLE_CSS;
  document.head.appendChild(el);
}

export function PeekOverlay(props: PeekOverlayProps): JSX.Element | null {
  const { controller, canvasHost, cursor, colorFor, draggingId = null, zStep = 60 } = props;
  const isActive = useSignalValue(controller.isActive);
  const liftSet = useSignalValue(controller.liftSet);

  // Inject stylesheet once.
  useEffect(() => {
    ensureStylesheetMounted();
  }, []);

  // Apply data-peek-active to the canvas host while active. Cleanup removes.
  useEffect(() => {
    if (!canvasHost) return undefined;
    if (isActive) {
      canvasHost.setAttribute("data-peek-active", "");
      return () => {
        canvasHost.removeAttribute("data-peek-active");
      };
    }
    return undefined;
  }, [isActive, canvasHost]);

  // Apply data-peek-lifted + z-index to lifted frames. Re-runs on every
  // liftSet change so dynamic lift sets (cursor moves) reflect immediately.
  useEffect(() => {
    if (!canvasHost) return undefined;
    if (!isActive || !liftSet) return undefined;

    const liftedIds = liftSet.orderedIds;
    const rankOf = new Map<string, number>();
    liftedIds.forEach((id, idx) => rankOf.set(id, idx));

    // Apply markers + per-frame translateZ + border colour. Existing inline
    // transform (e.g., `rotate(Nrad)` on rotated frames) is preserved and
    // we append `translateZ(...)`; both must compose for the lift to look
    // correct on rotated frames. The original transform is stashed and
    // restored on cleanup.
    const touched: Array<{ el: HTMLElement; origTransform: string }> = [];
    for (const id of liftedIds) {
      const el = canvasHost.querySelector(`[data-frame-id="${id}"]`);
      if (!(el instanceof HTMLElement)) continue;
      const rank = rankOf.get(id) ?? 0;
      el.setAttribute("data-peek-lifted", "");
      el.style.setProperty("--peek-z-index", String(rank + 100));
      // Border colour: dragged frame keeps its own colour, other lifted
      // frames go neutral when a drag is in progress. Otherwise everyone
      // shows their own colour.
      const isDragging = draggingId !== null;
      const isMe = id === draggingId;
      let borderColor: string;
      if (!isDragging) {
        borderColor = colorFor ? colorFor(id) : "var(--accent)";
      } else if (isMe) {
        borderColor = colorFor ? colorFor(id) : "var(--accent)";
      } else {
        borderColor = NEUTRAL_BORDER_COLOR;
      }
      el.style.setProperty("--peek-border-color", borderColor);
      // Stash existing inline transform; append translateZ for the lift.
      const origTransform = el.style.transform;
      const lift = `translateZ(${rank * zStep}px)`;
      el.style.transform = origTransform ? `${origTransform} ${lift}` : lift;
      touched.push({ el, origTransform });
    }

    return () => {
      for (const { el, origTransform } of touched) {
        el.removeAttribute("data-peek-lifted");
        el.removeAttribute("data-peek-dragging");
        el.style.removeProperty("--peek-z-index");
        el.style.removeProperty("--peek-border-color");
        el.style.transform = origTransform;
      }
    };
  }, [isActive, liftSet, canvasHost, colorFor, draggingId, zStep]);

  if (!isActive) return null;

  return (
    <>
      {/* Subtle dim layer for emphasis — sits under the cursor ring but
          above non-lifted content. Frame items still receive the
          opacity/filter from the stylesheet above. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.18) 80%)",
          zIndex: 25,
        }}
      />
      {/* Cursor ring */}
      {cursor ? (
        <div
          aria-hidden
          data-testid="peek-cursor-ring"
          style={{
            position: "absolute",
            left: `${cursor.x}px`,
            top: `${cursor.y}px`,
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "1.5px solid var(--accent)",
            background: "rgba(232, 58, 147, 0.08)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 60,
            transition: "transform 100ms linear",
          }}
        />
      ) : null}
    </>
  );
}
