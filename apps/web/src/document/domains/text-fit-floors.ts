// Single source for text-fit DEGENERACY GUARDS — the floors/caps that keep a text
// box or font from collapsing to ~0 or exploding past its container. These used to
// live as inline magic numbers scattered across three layers:
//   • render shrink-to-fit (TextBlock / text-autofit) — MIN_FIT_FONT_PX, the 0.3 scale
//     floor, the `1ch` CSS width floor;
//   • the agent add-path (agent-text-resize) — the 0.02/0.95 estimated-height band and
//     a hand-copied `0.04` mirror of the engine's flex floor.
// Tuning one used to mean hunting the others. They are consolidated here so a change is
// ONE edit and the px ↔ ratio ↔ scale relationship is explicit. The constants keep
// distinct semantic names (they are NOT the same number) — this is a single SOURCE,
// not a single value.
//
// NOTE (separate task): the add-path height ESTIMATE (`estimateTextHeightRatio`) exists
// only because weave has no text measurement before the DOM is built. When that is
// replaced by a real DOM-less measurement (pretext), it still feeds through
// `clampEstHeightRatio` below — these floors apply to a measured value just as they do
// to an estimated one, so this module is forward-compatible with that work.

// ── Render shrink-to-fit (TextBlock / fitFontScale) ──────────────────────────────

/** Minimum legible font size, design-px. Render shrink-to-fit never goes below this. */
export const MIN_FIT_FONT_PX = 11;

/** The hardest the render shrink-to-fit may scale a font, regardless of size — so a
 *  very large font can't jump to a jarringly tiny scale even while still above
 *  MIN_FIT_FONT_PX. The effective floor is the LARGER of this and the per-font px floor. */
export const MIN_FIT_SCALE = 0.3;

/** CSS min-width for rendered text so a flex-starved box can't drop below ~1 glyph
 *  (the inner text stops collapsing into a vertical ribbon; the frame box is still
 *  engine-owned). */
export const MIN_TEXT_WIDTH_CSS = "1ch";

// ── Agent add-path (estimate band + engine mirror) ───────────────────────────────

/** Add-time estimated box height as a fraction of its container — the sane band so a
 *  bad estimate can't set a 0-height box or one that fills the whole container. */
export const EST_HEIGHT_RATIO_FLOOR = 0.02;
export const EST_HEIGHT_RATIO_CAP = 0.95;

/** Mirror of the agocraft layout engine's private `MIN_MAIN_SHARE` (auto-flex adapter):
 *  the floor a flex child's main-axis share is clamped to. The engine does NOT export
 *  it, so this is the single weave-side mirror — the agent uses it to detect a
 *  degenerate incoming width (a value at/below the floor would be starved when read
 *  intrinsically). Keep in sync with `@agocraft/layout` auto-flex `MIN_MAIN_SHARE`. */
export const ENGINE_MIN_MAIN_SHARE = 0.04;

// ── Derived helpers (the px ↔ ratio ↔ scale relationships) ───────────────────────

/** The minimum render shrink scale for a given font px: never below MIN_FIT_SCALE,
 *  and never so small the font would drop under MIN_FIT_FONT_PX. Returns MIN_FIT_SCALE
 *  for a non-positive font px (not ready). */
export function minFitScaleFor(fontPx: number): number {
  if (!(fontPx > 0)) return MIN_FIT_SCALE;
  return Math.max(MIN_FIT_SCALE, MIN_FIT_FONT_PX / fontPx);
}

/** Clamp an add-time estimated (or, later, measured) height ratio into the sane band. */
export function clampEstHeightRatio(ratio: number): number {
  return Math.min(EST_HEIGHT_RATIO_CAP, Math.max(EST_HEIGHT_RATIO_FLOOR, ratio));
}
