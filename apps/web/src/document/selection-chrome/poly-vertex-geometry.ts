// WI-063 (AUDIT-006 F-3) — pure geometry kernel for the poly/line vertex
// handles. Extracted from `poly-vertex-handle.tsx` so the rotation-aware
// math (un-rotated size recovery, rotated-basis local↔screen transforms,
// DR-024 frame refit, endpoint similarity) is unit-testable independently
// of React/DOM. The `.tsx` keeps only the DOM reads (`getComputedStyle`,
// `querySelector`, `offsetWidth/Height`) and the handle rendering.

export interface PolyVertex {
  readonly x: number;
  readonly y: number;
  /** DR-033 — per-vertex curve type (smooth/corner). Rides through the
   *  geometry kernel untouched; only the handle reads it for shape + toggle. */
  readonly smooth?: boolean;
}

export interface PolyFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
}

/** Center + un-rotated frame size (screen px) + rotation, derived from the
 *  item's `[data-frame-id]` element and the SelectionLayer AABB bounds. */
export interface FrameGeom {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly theta: number;
}

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Parse the rotation angle (radians) out of a CSS `transform` computed
 *  value. Returns 0 for `none` / unparseable. Pure — takes the string the
 *  caller read off `getComputedStyle(el).transform`. */
export function parseRotationFromTransform(transform: string | null | undefined): number {
  if (!transform || transform === "none") return 0;
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (m?.[1] === undefined) return 0;
  const parts = m[1].split(",").map(Number);
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return 0;
  return Math.atan2(b, a);
}

/** Recover the UN-rotated frame size (screen px) from the AABB width, the
 *  element's transform-invariant aspect ratio (offsetWidth/offsetHeight),
 *  and the rotation. AABBw = W·|cos| + H·|sin| = H·(r·|cos| + |sin|), so
 *  H = AABBw / (r·|cos| + |sin|), W = r·H. The denominator is > 0 at EVERY
 *  angle, so this is exact even at 45° (where solving W,H from the AABB
 *  alone is singular: cos 2θ = 0). Returns `fallback` when the aspect ratio
 *  is unusable (degenerate denominator). */
export function recoverUnrotatedSize(
  aabbWidth: number,
  aspectRatio: number,
  theta: number,
  fallback: { readonly w: number; readonly h: number },
): { w: number; h: number } {
  const denom = aspectRatio * Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta));
  if (!(denom > 1e-6)) return { w: fallback.w, h: fallback.h };
  const h = aabbWidth / denom;
  return { w: aspectRatio * h, h };
}

/** Project a local (0..1 of frame) vertex to screen px through the rotated
 *  frame basis. */
export function localToScreen(g: FrameGeom, vx: number, vy: number): { x: number; y: number } {
  const lx = (vx - 0.5) * g.w;
  const ly = (vy - 0.5) * g.h;
  const cos = Math.cos(g.theta);
  const sin = Math.sin(g.theta);
  return { x: g.cx + lx * cos - ly * sin, y: g.cy + lx * sin + ly * cos };
}

/** Inverse of {@link localToScreen}: screen px → local (0..1 of frame). */
export function screenToLocal(g: FrameGeom, sx: number, sy: number): { x: number; y: number } {
  const dx = sx - g.cx;
  const dy = sy - g.cy;
  const cos = Math.cos(g.theta);
  const sin = Math.sin(g.theta);
  // inverse rotation (R(-θ)) then un-scale by the frame size
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return { x: lx / Math.max(1, g.w) + 0.5, y: ly / Math.max(1, g.h) + 0.5 };
}

/** DR-024 — refit the frame so it tightly contains the dragged local points,
 *  re-normalizing the points to [0,1] of the NEW frame. All math is OLD-frame-
 *  relative (no parent/screen dims needed) and assumes an axis-aligned frame.
 *  A ROTATED frame (θ≠0) can't be refit axis-aligned without baking rotation,
 *  so it falls back to the legacy clamp-in-place (frame unchanged). A collapsed
 *  axis (a straight line → zero-thickness box) centers the points on that axis
 *  and keeps a hairline frame dimension so the rubber-band hugs the line. */
export function refitFrameToPoints(
  localPts: ReadonlyArray<PolyVertex>,
  frame: PolyFrame,
  theta: number,
): { readonly frame?: PolyFrame; readonly points: ReadonlyArray<PolyVertex> } {
  if (Math.abs(theta) > 0.01) {
    return { points: localPts.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })) };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of localPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const EPS = 1e-3;
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const collapsedX = rawW < EPS;
  const collapsedY = rawH < EPS;
  const spanX = collapsedX ? EPS : rawW;
  const spanY = collapsedY ? EPS : rawH;
  const nextFrame: PolyFrame = {
    x: frame.x + minX * frame.width,
    y: frame.y + minY * frame.height,
    width: spanX * frame.width,
    height: spanY * frame.height,
    ...(frame.rotation !== undefined ? { rotation: frame.rotation } : {}),
  };
  const points = localPts.map((p) => ({
    x: collapsedX ? 0.5 : (p.x - minX) / spanX,
    y: collapsedY ? 0.5 : (p.y - minY) / spanY,
  }));
  return { frame: nextFrame, points };
}

/** OPEN-poly endpoint drag (DR-024 §B): a uniform similarity (scale + rotate)
 *  of the WHOLE polyline about the OPPOSITE endpoint, so the line stretches
 *  keeping its shape. Returns the new SCREEN points, or null when the base
 *  endpoint vector is degenerate (zero length) — the caller then free-moves
 *  the dragged point instead. `baseScreen` are the captured screen positions
 *  of every point at drag start. */
export function endpointSimilarityScreen(
  baseScreen: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  anchorIdx: number,
  cursorX: number,
  cursorY: number,
  draggedIdx: number,
): Array<{ x: number; y: number }> | null {
  const anchor = baseScreen[anchorIdx];
  const old = baseScreen[draggedIdx];
  if (anchor === undefined || old === undefined) return null;
  const vOX = old.x - anchor.x;
  const vOY = old.y - anchor.y;
  const len2 = vOX * vOX + vOY * vOY;
  if (len2 < 1e-6) return null;
  // Complex-number similarity (vNew / vOld) = scale·e^{iφ}, applied about the
  // anchor to every point so inter-vertex distances scale uniformly.
  const vNX = cursorX - anchor.x;
  const vNY = cursorY - anchor.y;
  const a = (vNX * vOX + vNY * vOY) / len2;
  const b = (vNY * vOX - vNX * vOY) / len2;
  return baseScreen.map((q) => {
    const dx = q.x - anchor.x;
    const dy = q.y - anchor.y;
    return { x: anchor.x + a * dx - b * dy, y: anchor.y + b * dx + a * dy };
  });
}
