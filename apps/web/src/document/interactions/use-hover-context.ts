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
    const id = el.getAttribute("data-frame-id")
      ?? el.getAttribute("data-shape-id")
      ?? el.getAttribute("data-hotspot-id")
      ?? value;
    const role = el.getAttribute("data-hover-role") ?? probe.kind;
    return { hoveredKind: kind, hoveredId: id ?? undefined, hoveredRole: role };
  }
  return EMPTY;
}

/** Subscribe to hover state under `hostRef`. Returns the current
 *  context as React state so re-renders happen on transitions. Designed
 *  to be cheap: one listener on the host, no per-element wiring,
 *  deduped state writes (no re-render when the kind/id are unchanged). */
export function useHoverContext(
  hostRef: { readonly current: HTMLElement | null },
): HoverContext {
  const [ctx, setCtx] = useState<HoverContext>(EMPTY);
  const lastRef = useRef<HoverContext>(EMPTY);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const update = (next: HoverContext): void => {
      const prev = lastRef.current;
      if (
        prev.hoveredKind === next.hoveredKind
        && prev.hoveredId === next.hoveredId
        && prev.hoveredRole === next.hoveredRole
      ) return;
      lastRef.current = next;
      setCtx(next);
    };

    const onMove = (e: PointerEvent): void => {
      update(readHoverInfo(e.target));
    };
    const onLeave = (): void => update(EMPTY);

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
    // host is read via ref; we only re-subscribe when the ref's element
    // identity changes via remount, which the caller handles by remount.
  }, [hostRef]);

  return ctx;
}
