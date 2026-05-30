// WI-058 / DR-021 — viewport culling registry for the infinite canvas.
//
// On an infinite canvas the entire document lives inside one
// `transform: scale()` plane (FrameStage). Without culling every frame —
// including the ones panned/zoomed far off-screen — keeps a painted,
// composited layer (and, for images, a GPU texture). Zooming in on a large
// document therefore inflates GPU/layer memory without bound (see
// records/rendering-reviews/RPR-001).
//
// This context publishes a single IntersectionObserver (root = the
// viewport-clipping outer container) as a `register` channel. Each
// NestedFrame registers its wrapper element; when the element leaves the
// viewport (plus a one-viewport `rootMargin` buffer) the registry toggles
// the element to `visibility: hidden` so the browser drops its paint +
// raster. Re-entering the buffer restores it.
//
// Why this shape (mirrors TotalScaleContext, lives in the same folder):
//   - Domain renderers under `document/` import the context without a
//     circular dependency back into `pages/FrameStage`.
//   - The toggle is a direct `el.style.visibility` ref-mutation — NO React
//     re-render on the pan/zoom hot path, identical to the `applyHitGate`
//     pattern already used for the pointer-events hit gate.
//   - `content-visibility: auto` was rejected: it implies `contain: paint`,
//     which clips a frame's intentional overflow bleed (slide bullets /
//     canvas shapes drawn past the frame). `visibility` adds no containment,
//     so bleed survives while a frame is on-screen.
//
// Null when no FrameStage owns the tree, or when the canvas is not in
// infinite mode (stacked/fit flavors fit the viewport, so nothing is ever
// off-screen to cull). Consumers must no-op on null.

import { createContext, useContext } from "react";

export interface ViewportCullRegistry {
  /**
   * Start observing `el` for viewport intersection. `onChange(visible)` is
   * invoked (asynchronously, off the main thread) whenever the element
   * crosses the viewport + buffer boundary. Returns an unregister function;
   * call it on unmount.
   *
   * The element starts in its natural (visible) state — the observer fires
   * the first real classification shortly after registration, so an
   * off-screen frame is never rendered-then-hidden in the same frame, and
   * an on-screen frame is never hidden by mistake before the observer runs.
   */
  observe(el: Element, onChange: (visible: boolean) => void): () => void;
}

/**
 * IntersectionObserver `rootMargin` for frame culling — the pre-render buffer
 * around the viewport (WI-058 2b). `"50%"` keeps the working set tight (~2×2
 * viewports alive) while still rendering + re-decoding a frame about half a
 * viewport before it reaches the edge, which covers a normal drag-pan without
 * pop-in. Larger values pre-render more (smoother fast flings, more memory);
 * smaller values cull sooner (less memory, higher pop-in risk). Measured curve
 * lives in records/rendering-reviews/RPR-001-addendum-phase1-measurement.md.
 */
export const CULL_ROOT_MARGIN = "50%";

export const ViewportCullContext = createContext<ViewportCullRegistry | null>(null);

// ── Per-frame cull state (WI-058 Phase 2a) ────────────────────────────────
//
// Frame-level culling (visibility:hidden) frees PAINT/COMPOSITE but NOT the
// decoded image bitmaps — `visibility:hidden` keeps the element in the render
// tree, so a culled `<img>` stays decoded (measured: 64 culled frames retained
// ~64 MB of decoded bitmaps; see RPR-001 addendum). To free that pool, each
// NestedFrame publishes its own cull state here; heavy content (ImageBlock)
// reads it via `useIsCulled()` and drops its `<img>` while culled, restoring it
// when the frame re-enters the buffer (one viewport early → re-decode finishes
// before the frame is actually on-screen).
//
// This is a per-frame React-state signal that flips only on a viewport-cross
// transition (NOT the 60Hz scale hot path), so the re-render cost is bounded to
// the moment a frame crosses the buffer edge.
export const FrameCulledContext = createContext<boolean>(false);

/** True when the nearest enclosing frame is currently culled (off-screen).
 *  Heavy renderers use this to drop their decode/raster while hidden. */
export function useIsCulled(): boolean {
  return useContext(FrameCulledContext);
}
