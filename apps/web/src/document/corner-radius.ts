// Corner-radius model — shared by shapes, frames, images and videos.
//
// The radius is stored as an ABSOLUTE radius in design-px and is always drawn
// as a CIRCLE (rx === ry), clamped to half the box's SHORT side. This is the
// Figma model and gives the three guarantees the product asks for:
//
//   1. The maximum is 50% of the short side  → the half-short clamp below.
//   2. A resize keeps the same corner shape  → px is size-independent; only the
//      half-short clamp re-engages once a side shrinks past `2 × radius`.
//   3. Horizontal and vertical curvature are always equal → one scalar, drawn
//      circular (never an ellipse).
//
// Rendering split:
//   • Images / videos render with CSS `border-radius: Npx`. The browser already
//     clamps a single px radius to the half-short side AND draws it circular, so
//     the stored px passes straight through — no math here.
//   • Frames render an SVG `<rect>`, and SVG clamps `rx` and `ry`
//     INDEPENDENTLY (a wide box would otherwise become a pill/ellipse). So the
//     frame renderer must apply the half-short clamp itself via the helpers
//     below, projecting the design-px radius onto its measured screen-px box.

/** Clamp an absolute corner radius (px) to a box's half-short side. */
export function clampCornerRadiusPx(px: number, w: number, h: number): number {
  const cap = Math.min(w, h) / 2;
  if (!(cap > 0)) return 0;
  return Math.max(0, Math.min(px, cap));
}

/** Absolute radius (px) → 0..1 fraction of the box's half-short side. Saturates
 *  at 1 (a "pill" on the short axis). Used by the toolbar slider read-out and by
 *  FrameBlock to re-project a design-px radius onto a screen-px box. */
export function cornerRadiusPxToFraction(px: number, w: number, h: number): number {
  const half = Math.min(w, h) / 2;
  if (!(half > 0)) return 0;
  return Math.max(0, Math.min(px / half, 1));
}

/** 0..1 fraction of the box's half-short side → absolute radius (px). Inverse of
 *  `cornerRadiusPxToFraction`. Used when the slider writes a value and when the
 *  legacy ratio → px document migration runs. */
export function cornerRadiusFractionToPx(fraction: number, w: number, h: number): number {
  const half = Math.min(w, h) / 2;
  if (!(half > 0)) return 0;
  return Math.max(0, Math.min(fraction, 1)) * half;
}

// ── Per-corner radii (WI-109 — Figma-style corner-radius handle) ────────────
//
// A radius can be UNIFORM (one scalar, all four corners) or PER-CORNER (the
// on-canvas handle's double-click splits it into four independently-draggable
// corners). The four-tuple is stored on an additive optional attr — frame
// `cornerRadii`, image/video `borderRadii` — leaving the scalar field as the
// uniform fast-path. Shapes already carry `subAttrs.cornerRadii`.

export type CornerKey = "tl" | "tr" | "br" | "bl";

export interface CornerRadii {
  readonly tl: number;
  readonly tr: number;
  readonly br: number;
  readonly bl: number;
}

export const CORNER_KEYS: ReadonlyArray<CornerKey> = ["tl", "tr", "br", "bl"];

/** A four-tuple with every corner set to `r`. */
export function uniformRadii(r: number): CornerRadii {
  const v = Math.max(0, r);
  return { tl: v, tr: v, br: v, bl: v };
}

/** True when all four corners are (near-)equal — the merge target / the
 *  "renders the same as a scalar" case. */
export function isUniformRadii(r: CornerRadii): boolean {
  return (
    Math.abs(r.tl - r.tr) < 0.01 && Math.abs(r.tr - r.br) < 0.01 && Math.abs(r.br - r.bl) < 0.01
  );
}

/** CSS `border-radius` value for per-corner radii (px). Order is the CSS
 *  spec's tl/tr/br/bl. The browser clamps each corner to fit and draws it
 *  circular — same as the uniform single-px path. */
export function cssBorderRadius(r: CornerRadii): string {
  return `${Math.max(0, r.tl)}px ${Math.max(0, r.tr)}px ${Math.max(0, r.br)}px ${Math.max(0, r.bl)}px`;
}

/** CSS `border-radius` for an image/video block: the per-corner four-tuple when
 *  present, else the uniform scalar px, else 0 (sharp). */
export function mediaBorderRadius(
  radii: CornerRadii | undefined,
  scalarPx: number | undefined,
): string | number {
  if (radii !== undefined) return cssBorderRadius(radii);
  return scalarPx ? `${scalarPx}px` : 0;
}

/** SVG `<path>` data for a `w × h` rounded rectangle with PER-CORNER radii
 *  (origin top-left, traced clockwise). Each corner is clamped to the
 *  half-short side so adjacent arcs never overlap — same geometry the shape
 *  renderer uses, so a frame's per-corner box matches a rectangle shape's. */
export function perCornerRectPath(w: number, h: number, r: CornerRadii): string {
  const cap = Math.min(w, h) / 2;
  const tl = Math.max(0, Math.min(r.tl, cap));
  const tr = Math.max(0, Math.min(r.tr, cap));
  const br = Math.max(0, Math.min(r.br, cap));
  const bl = Math.max(0, Math.min(r.bl, cap));
  return (
    `M ${tl} 0` +
    ` L ${w - tr} 0` +
    ` A ${tr} ${tr} 0 0 1 ${w} ${tr}` +
    ` L ${w} ${h - br}` +
    ` A ${br} ${br} 0 0 1 ${w - br} ${h}` +
    ` L ${bl} ${h}` +
    ` A ${bl} ${bl} 0 0 1 0 ${h - bl}` +
    ` L 0 ${tl}` +
    ` A ${tl} ${tl} 0 0 1 ${tl} 0` +
    " Z"
  );
}
