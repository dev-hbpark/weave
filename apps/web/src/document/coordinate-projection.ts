// WI-063 (AUDIT-006 F-1a) — pure design-plane coordinate projection.
//
// Extracted from DesignPage's `screenToDesign` / `designToHost`, which
// previously duplicated the same scale/origin derivation inline. The DOM
// sampling (finding a `[data-frame-id]` element, reading its
// `getBoundingClientRect`, looking up its design-space frame) stays in the
// View — that is a legitimate View concern. The MATH lives here so it is
// unit-testable and single-sourced.
//
// A `ProjectionBasis` describes the affine map between design-space
// (0..design.width / 0..design.height) and CLIENT space (clientX/clientY
// px, the coordinate space of `getBoundingClientRect`). Both projectors
// derive the same basis, then either go client→design or design→client;
// host-relative pixels are `design→client minus the host's top-left`.
//
// Two ways to derive the basis:
//   1. `basisFromFrameSample` — back the live camera (pan/zoom) out of a
//      rendered frame's measured rect + its known design-space frame. This
//      is exact even when the infinite-canvas tool has zoomed.
//   2. `basisFromLetterbox` — naive fit-and-centre, used only when no frame
//      is rendered yet (empty document).

/** Subset of `DOMRect` the projection needs. */
export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A frame in design-space ratio coords (0..1 of the design plane). */
export interface RatioFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DesignSize {
  readonly width: number;
  readonly height: number;
}

/** Affine map design-space → CLIENT space (clientX/Y px).
 *  `clientX = originX + designX * scaleX` (and likewise Y). */
export interface ProjectionBasis {
  readonly scaleX: number;
  readonly scaleY: number;
  /** Client-space px of design-space origin (0,0). */
  readonly originX: number;
  readonly originY: number;
}

/** Derive the basis from a rendered frame sample: its measured client rect
 *  plus the design-space frame it occupies. Returns null when the sample is
 *  degenerate (zero-area rect or frame), which the caller treats as
 *  "fall back to letterbox". */
export function basisFromFrameSample(
  sampleRect: RectLike,
  frame: RatioFrame,
  design: DesignSize,
): ProjectionBasis | null {
  if (sampleRect.width <= 0 || sampleRect.height <= 0) return null;
  if (frame.width <= 0 || frame.height <= 0) return null;
  const scaleX = sampleRect.width / (frame.width * design.width);
  const scaleY = sampleRect.height / (frame.height * design.height);
  return {
    scaleX,
    scaleY,
    originX: sampleRect.left - frame.x * design.width * scaleX,
    originY: sampleRect.top - frame.y * design.height * scaleY,
  };
}

/** Derive the basis from naive letterbox fit (fit-and-centre the design
 *  plane inside the host rect). Returns null when the host has no area. */
export function basisFromLetterbox(hostRect: RectLike, design: DesignSize): ProjectionBasis | null {
  const baseScale = Math.min(hostRect.width / design.width, hostRect.height / design.height);
  if (!(baseScale > 0)) return null;
  const letterboxX = (hostRect.width - design.width * baseScale) / 2;
  const letterboxY = (hostRect.height - design.height * baseScale) / 2;
  return {
    scaleX: baseScale,
    scaleY: baseScale,
    originX: hostRect.left + letterboxX,
    originY: hostRect.top + letterboxY,
  };
}

/** Project a client-space point to design-space. */
export function clientToDesign(
  basis: ProjectionBasis,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  return {
    x: (clientX - basis.originX) / basis.scaleX,
    y: (clientY - basis.originY) / basis.scaleY,
  };
}

/** Project a design-space point to client-space. */
export function designToClient(
  basis: ProjectionBasis,
  designX: number,
  designY: number,
): { x: number; y: number } {
  return {
    x: basis.originX + designX * basis.scaleX,
    y: basis.originY + designY * basis.scaleY,
  };
}

/** Project a design-space point to host-relative px (origin at the host's
 *  top-left, the space an absolutely-positioned overlay renders into). */
export function designToHostPx(
  basis: ProjectionBasis,
  designX: number,
  designY: number,
  hostLeft: number,
  hostTop: number,
): { x: number; y: number } {
  const client = designToClient(basis, designX, designY);
  return { x: client.x - hostLeft, y: client.y - hostTop };
}
