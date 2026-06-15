// WI-237 / DR-152 — text auto-fit pure core.
//
// weave has no text auto-height (the render-time measure-and-write-back was removed
// — TextBlock.tsx L11-17 — because it fought the engine non-convergently). This
// module is the SAFE convergent replacement's decision core: given a text's current
// box height and the height its content actually needs (measured in the DOM), decide
// whether to feed a corrected height to the ENGINE.
//
// Convergence (why this won't repeat the removed instability): the measurement is the
// content's intrinsic height at its ENGINE-BOUND width. Width (the cross axis) is not
// changed by this refit, so the measured value does not depend on the refit's output
// → re-measuring after the box is corrected yields the same value → fixed point. A
// threshold suppresses sub-pixel thrash; the result is idempotent.

export interface RefitOptions {
  /** Min px difference worth a refit — suppresses sub-pixel measurement thrash. */
  readonly thresholdPx?: number;
  /** Lower bound for a written height (never collapse below a readable floor). */
  readonly minPx?: number;
  /** Upper bound (e.g. the slide/canvas px) so a degenerate measure can't explode. */
  readonly maxPx?: number;
}

const DEFAULT_THRESHOLD_PX = 2;

/** WI-237 — runtime feature flag. DEFAULT ON as of iteration 3 (live-verified:
 *  boxes fit, no oscillation, coalesced to one undo/save per settle). Escape hatch:
 *  set `localStorage["weave.textAutofit"] = "off"` to disable (e.g. to debug a
 *  layout). Read per-measure so it can be flipped live without a rebuild. */
export function isTextAutofitEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("weave.textAutofit") !== "off";
  } catch {
    return true;
  }
}

/** The maximum auto-fit writes per mounted text before giving up — a hard
 *  loop-breaker so a non-converging case (e.g. a layout that overrides the height
 *  we set) can never thrash the document. Convergence normally settles in 1. */
export const MAX_REFIT_ATTEMPTS = 4;

/** True when the box should be refit to the measured content height. Both inputs are
 *  absolute px. Returns false for non-finite / non-positive inputs (measurement not
 *  ready) and when already within `thresholdPx` (converged). */
export function shouldRefitHeight(
  currentPx: number,
  measuredPx: number,
  opts: RefitOptions = {},
): boolean {
  if (!Number.isFinite(currentPx) || !Number.isFinite(measuredPx)) return false;
  if (!(measuredPx > 0)) return false;
  const threshold = opts.thresholdPx ?? DEFAULT_THRESHOLD_PX;
  const target = clampRefitPx(measuredPx, opts);
  return Math.abs(target - currentPx) > threshold;
}

/** Readable floor for shrink-to-fit — never shrink a font below this design-px. */
export const MIN_FIT_FONT_PX = 11;

/** WI-238 (rev2) / DR-153 — render-level shrink-to-fit scale. When a text's natural
 *  (full-font) content is taller/wider than its box (grid cell / region), return the
 *  scale (< 1) to shrink it so it fits; 1 when it already fits (NEVER scales up).
 *  Height-driven in practice (width is layout-bound so the text wraps to the box
 *  width); width guard covers nowrap/short boxes. Floored at `minScale` so text can't
 *  go microscopic. Pure — TextBlock applies the result as a CSS transform (no doc
 *  write, no engine round-trip → deterministic, no undo/save churn). */
export function fitFontScale(
  boxH: number,
  naturalH: number,
  boxW: number,
  naturalW: number,
  minScale: number,
): number {
  if (!Number.isFinite(boxH) || !Number.isFinite(naturalH)) return 1;
  if (!(boxH > 0) || !(naturalH > 0)) return 1;
  const byH = boxH / naturalH;
  const byW = boxW > 0 && naturalW > 0 ? boxW / naturalW : 1;
  const raw = Math.min(byH, byW);
  if (raw >= 1) return 1; // already fits — never scale UP
  return Math.max(minScale, raw);
}

/** WI-238 (rev) / DR-153 — grid cell shrink-to-fit. A grid cell can't grow its box
 *  (the row track owns it), so an overflowing cell SHRINKS its font to fit instead
 *  (keeps the table compact, never overflows the slide). Given the cell's current
 *  font px and its content vs box height, return the font px that fits: scale down
 *  by the overflow, floored at MIN_FIT_FONT_PX, never UP (≤ current). Returns the
 *  current px when it already fits (content ≤ box) or inputs aren't ready.
 *  Convergent: after shrinking, the content scales down with the font → fits → no
 *  further shrink. */
export function shrinkFontTarget(
  currentPx: number,
  boxPx: number,
  contentPx: number,
  minPx = MIN_FIT_FONT_PX,
): number {
  if (!Number.isFinite(currentPx) || !(currentPx > 0)) return currentPx;
  if (!Number.isFinite(boxPx) || !Number.isFinite(contentPx)) return currentPx;
  if (!(boxPx > 0) || contentPx <= boxPx) return currentPx; // already fits
  const scaled = currentPx * (boxPx / contentPx);
  return Math.max(minPx, Math.min(currentPx, scaled));
}

/** The height to actually write: the measured content height, clamped to [min, max].
 *  Keeps a degenerate/zero measurement from collapsing or exploding the box. */
export function clampRefitPx(measuredPx: number, opts: RefitOptions = {}): number {
  let v = measuredPx;
  if (opts.minPx !== undefined) v = Math.max(opts.minPx, v);
  if (opts.maxPx !== undefined) v = Math.min(opts.maxPx, v);
  return v;
}
