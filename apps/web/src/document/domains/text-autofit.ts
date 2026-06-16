// WI-238 rev2 / DR-153 — text auto-fit pure core (render-level shrink-to-fit).
//
// weave has no text auto-height (the render-time measure-and-write-back was removed
// — TextBlock.tsx — because it fought the engine non-convergently). Auto-fit is now
// PURELY render-level: when a text's natural (full-font) content overflows its
// engine-assigned box, the font is SCALED DOWN via a CSS transform so it fits — the
// box is left untouched (it keeps filling its cell / flex slot). The content is laid
// out at full font (the transform is visual only), so the measured layout size stays
// the natural size → a fixed point → no measure-write loop, no doc write, no engine
// round-trip, no undo/save churn.
//
// NOTE: the earlier WI-237/DR-152 channel that measured content and wrote a corrected
// height/font back to the ENGINE (TextFitProvider / requestTextFit / shouldRefitHeight)
// was SUPERSEDED by this render-level approach (it shrank the box too small and was
// timing-flaky) and has been decommissioned. This module is the surviving core.

/** WI-237 — runtime feature flag. DEFAULT ON as of iteration 3 (live-verified:
 *  boxes fit, no oscillation). Escape hatch: set `localStorage["weave.textAutofit"]
 *  = "off"` to disable (e.g. to debug a layout). Read per-measure so it can be
 *  flipped live without a rebuild. */
export function isTextAutofitEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("weave.textAutofit") !== "off";
  } catch {
    return true;
  }
}

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
