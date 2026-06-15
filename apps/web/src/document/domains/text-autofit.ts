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

/** The height to actually write: the measured content height, clamped to [min, max].
 *  Keeps a degenerate/zero measurement from collapsing or exploding the box. */
export function clampRefitPx(measuredPx: number, opts: RefitOptions = {}): number {
  let v = measuredPx;
  if (opts.minPx !== undefined) v = Math.max(opts.minPx, v);
  if (opts.maxPx !== undefined) v = Math.min(opts.maxPx, v);
  return v;
}
