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
const PROBES: ReadonlyArray<MatchProbe> = [
  { attr: "data-handle-kind", kind: "handle" },
  { attr: "data-hotspot-id", kind: "hotspot" },
  { attr: "data-shape-id", kind: "shape" },
  { attr: "data-textbox-id", kind: "text" },
  { attr: "data-frame-kind", kind: "frame" },
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
      if (k === "image" || k === "video" || k === "shape" || k === "text") {
        kind = k;
      }
    }
    const id =
      el.getAttribute("data-frame-id") ??
      el.getAttribute("data-shape-id") ??
      el.getAttribute("data-hotspot-id") ??
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
      // Limit the publish to surfaces we own (frame / bar / shape /
      // hotspot / handle). Anything outside the canvas host (toolbar,
      // header, body) should not poison the hover state.
      if (info.hoveredKind === "none") {
        const t = e.target;
        const insideHost = t instanceof Node ? host.contains(t) : false;
        const onBar = t instanceof Element ? t.closest("[data-quick-actions-bar]") !== null : false;
        if (!insideHost && !onBar) {
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
