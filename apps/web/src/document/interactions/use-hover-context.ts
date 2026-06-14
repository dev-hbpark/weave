// WI-027 Phase B — useHoverContext.
//
// Tracks the DOM element under the pointer and builds a free-form
// HoverContext that feeds CommandMetadata.visibleWhen / enabledWhen.
//
// The hook listens on a host element (typically the design plane root)
// for `pointermove` / `pointerleave` and walks `event.target.closest(...)`
// against a fixed allowlist of data-attribute markers to identify the
// hovered surface. The resolved context is published into React state
// so consumers (QuickActionBar, hover hints) re-render on transitions.
//
// We intentionally read `pointermove` rather than `mouseenter` /
// `mouseover` per descendant because the design plane has many small
// shapes; one capture-phase listener on the root is faster and avoids
// dozens of listener registrations.

import { useEffect, useRef, useState } from "react";
import { pointerWithinRects } from "./handle-hysteresis.js";

/** Recognised hover surfaces. Add a new kind by:
 *    1. Adding a `data-hover-kind="<name>"` attribute on the DOM
 *       element you want to register, OR
 *    2. Adding the closest()-selector below and the matching kind
 *       string returned from `readHoverInfo`.
 *
 *  Both work; the data-attribute path is preferred because the kind
 *  travels with the element instead of being centralised in this file. */
export type HoverKind =
  | "frame"
  | "image"
  | "video"
  | "shape"
  | "line"
  | "text"
  | "hotspot"
  | "handle"
  | "background"
  | "none";

export interface HoverContext {
  readonly hoveredKind: HoverKind;
  /** DOM id of the hovered target (frame id / shape id / hotspot id). */
  readonly hoveredId: string | undefined;
  /** Optional role qualifier within the kind — e.g. handle's resize
   *  direction, frame's body vs chrome. */
  readonly hoveredRole: string | undefined;
}

const EMPTY: HoverContext = {
  hoveredKind: "none",
  hoveredId: undefined,
  hoveredRole: undefined,
};

interface MatchProbe {
  readonly attr: string;
  readonly kind: HoverKind;
}

// Order matters — the first match wins. Handles / hotspots are checked
// before frames because they are descendants of frames in the DOM.
// `background` is checked LAST so any nested reactive surface inside the
// design plane (frame, shape, handle, …) wins; only the bare plane reads
// as background.
const PROBES: ReadonlyArray<MatchProbe> = [
  { attr: "data-handle-kind", kind: "handle" },
  { attr: "data-hotspot-id", kind: "hotspot" },
  { attr: "data-shape-id", kind: "shape" },
  { attr: "data-textbox-id", kind: "text" },
  { attr: "data-frame-kind", kind: "frame" },
  { attr: "data-design-plane", kind: "background" },
];

function readHoverInfo(target: EventTarget | null): HoverContext {
  if (!(target instanceof Element)) return EMPTY;
  // WI-036 — QuickActionBar hover target union. When the pointer
  // lands on the anchor wrap (or the bar inside it, or any descendant
  // of either), report the underlying frame's hover so the visible
  // commands don't collapse mid-gesture. The wrap carries
  // `data-quick-actions-frame-id="<id>"` plus an invisible padding
  // that extends the hit-area into the frame ↔ bar gap; the wrap is
  // therefore the single source for both the anchor id AND the union
  // hit-test.
  const anchor = target.closest("[data-quick-actions-frame-id]");
  if (anchor !== null) {
    const id = anchor.getAttribute("data-quick-actions-frame-id") ?? undefined;
    if (id !== undefined) {
      return { hoveredKind: "frame", hoveredId: id, hoveredRole: "frame" };
    }
  }
  for (const probe of PROBES) {
    const el = target.closest(`[${probe.attr}]`);
    if (el === null) continue;
    const value = el.getAttribute(probe.attr) ?? undefined;
    // Frames also carry their domain kind via data-frame-kind; honour
    // it so an image-frame reports "image", not the generic "frame".
    let kind: HoverKind = probe.kind;
    if (probe.kind === "frame") {
      const k = value;
      if (k === "image" || k === "video" || k === "shape" || k === "line" || k === "text") {
        kind = k;
      }
    }
    const id =
      el.getAttribute("data-frame-id") ??
      el.getAttribute("data-shape-id") ??
      el.getAttribute("data-hotspot-id") ??
      // A handle reports the item it BELONGS to, not the handle-kind
      // string. SelectionLayer wraps every registry handle in a div
      // carrying `data-selection-handle-item-id`, so a handle hover
      // resolves to its owning item — this lets the hysteresis below
      // recognise "still on my own handle" without geometry.
      el.closest("[data-selection-handle-item-id]")?.getAttribute("data-selection-handle-item-id") ??
      value;
    const role = el.getAttribute("data-hover-role") ?? probe.kind;
    return { hoveredKind: kind, hoveredId: id ?? undefined, hoveredRole: role };
  }
  return EMPTY;
}

/** WI-036 grace window. Mouse leaving a frame and crossing a pixel-
 *  gap to the floating QuickActionBar is a common gesture; without a
 *  grace the bar collapses mid-trajectory and the click is lost. 200ms
 *  matches Figma / Radix HoverCard defaults. */
const HOVER_GRACE_MS = 200;

/** Live bounding rects of every mounted handle owned by `itemId`. Empty
 *  when the item shows no handles (e.g. an unhovered item in a multi-
 *  selection) — hysteresis then does not apply and hover switches
 *  immediately, exactly as before. */
function handleRectsForItem(itemId: string): DOMRect[] {
  if (typeof document === "undefined") return [];
  const esc =
    typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(itemId) : itemId;
  const rects: DOMRect[] = [];
  document.querySelectorAll(`[data-selection-handle-item-id="${esc}"]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push(r);
  });
  return rects;
}

/** Is the pointer still within reach of `itemId`'s handles? Tests each
 *  handle rect grown by the hysteresis margin so the body↔handle gap and
 *  the handle itself both count as "still here". Body rect is
 *  deliberately excluded so hovering a NESTED inner item (which lives in
 *  the body interior) still switches the hover to it. */
function pointerWithinHandleAffordance(x: number, y: number, itemId: string): boolean {
  return pointerWithinRects(x, y, handleRectsForItem(itemId));
}

/** Subscribe to hover state under `hostRef`. Returns the current
 *  context as React state so re-renders happen on transitions. Designed
 *  to be cheap: one listener on the host, no per-element wiring,
 *  deduped state writes (no re-render when the kind/id are unchanged). */
export function useHoverContext(hostRef: { readonly current: HTMLElement | null }): HoverContext {
  const [ctx, setCtx] = useState<HoverContext>(EMPTY);
  const lastRef = useRef<HoverContext>(EMPTY);
  const graceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const cancelGrace = (): void => {
      if (graceTimerRef.current !== null) {
        window.clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };

    const update = (next: HoverContext): void => {
      const prev = lastRef.current;
      if (
        prev.hoveredKind === next.hoveredKind &&
        prev.hoveredId === next.hoveredId &&
        prev.hoveredRole === next.hoveredRole
      )
        return;
      lastRef.current = next;
      setCtx(next);
    };

    const onMove = (e: PointerEvent): void => {
      // WI-036 — window-level pointermove so the hover state
      // correctly tracks the pointer when it lands on the QuickAction-
      // Bar that's mounted outside the canvas host (fixed-position
      // anchored mount). Without this, the bar's element fires no
      // host-scoped pointermove and the bar collapses.
      cancelGrace();
      const info = readHoverInfo(e.target);
      // Handle-area hysteresis. Once an item is hovered and its handles
      // are mounted, keep it as the hover target while the pointer is
      // still within reach of those handles — even when it has drifted
      // off the body onto bare canvas or grazed an adjacent item. This
      // is what lets the user travel from the body to a corner / rotate
      // handle without the chrome (and the handle) vanishing first.
      // Skipped when the new target IS the current item (normal tracking)
      // and naturally inert when the item has no mounted handles.
      const sticky = lastRef.current;
      if (
        sticky.hoveredId !== undefined &&
        sticky.hoveredKind !== "none" &&
        sticky.hoveredKind !== "background" &&
        info.hoveredId !== sticky.hoveredId &&
        pointerWithinHandleAffordance(e.clientX, e.clientY, sticky.hoveredId)
      ) {
        return;
      }
      // Limit the publish to surfaces we own (frame / bar / shape /
      // hotspot / handle). Anything outside the canvas host (toolbar,
      // header, body) should not poison the hover state.
      if (info.hoveredKind === "none") {
        const t = e.target;
        const insideHost = t instanceof Node ? host.contains(t) : false;
        const onBar = t instanceof Element ? t.closest("[data-quick-actions-bar]") !== null : false;
        // WI-039 follow-up (2026-05-27) — the bottom thumbnail panel
        // dispatches `data-frame-kind` on each non-disabled tile so
        // tile hover paints the canvas's HoverAffordanceLayer. Treat
        // the panel as a recognised hover surface: when the pointer
        // sits over panel chrome (between tiles, or over a disabled
        // tile that's been stripped of `data-frame-kind`), publish
        // EMPTY immediately instead of arming the 200ms grace timer.
        // Without this, leaving a thumbnail leaves the canvas frame
        // outlined for ~200ms — the user reported that as "stale" on
        // 2026-05-27.
        const onThumbnailPanel =
          t instanceof Element ? t.closest('[data-testid="thumbnail-panel"]') !== null : false;
        if (!insideHost && !onBar && !onThumbnailPanel) {
          // Mouse left both the canvas host and the bar — start the
          // grace window the same way `pointerleave` would.
          graceTimerRef.current = window.setTimeout(() => {
            graceTimerRef.current = null;
            update(EMPTY);
          }, HOVER_GRACE_MS);
          return;
        }
      }
      update(info);
    };

    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    return () => {
      cancelGrace();
      window.removeEventListener("pointermove", onMove, { capture: true });
    };
  }, [hostRef]);

  return ctx;
}
