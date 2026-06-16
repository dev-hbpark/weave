// WI-051 Step 3 / DR-064 — engine-side text measurement wiring (weave host).
//
// The agocraft layout engine measures a text leaf's intrinsic size through an
// INJECTED `MeasureText` capability (it stays pure / DOM-free). weave provides the
// browser implementation (`@agocraft/text-measure-browser` = Pretext + Canvas2D) and
// hands it to the engine's Hug-reflow calls (commands.ts) — weave itself runs NO fit
// logic; it only wires the capability (a "pixel oracle"), per the hands-off goal.
//
// ON BY DEFAULT (since the add / edit / paste / reparent (flex·grid·free) content-hug
// paths were live-verified on the dev server). Escape hatch:
// `localStorage["weave.engineTextMeasure"] = "off"` reverts to the prior geometry
// behavior (the WI-238 cross-stretch / fitFontScale font-shrink path) instantly,
// without a rebuild — kept because this gates engine-layout sizing (the area with the
// most regression history).

import type { MeasureText } from "@agocraft/layout";
import { createBrowserTextMeasurer } from "@agocraft/text-measure-browser";

/** True when engine-side text measurement is enabled — DEFAULT ON; disabled only by
 *  the exact escape-hatch value `localStorage["weave.engineTextMeasure"] = "off"`. */
export function engineTextMeasureEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("weave.engineTextMeasure") !== "off";
  } catch {
    return true;
  }
}

let cached: MeasureText | undefined;

/** Canvas2D CANNOT resolve a CSS variable in a font family — `ctx.font =
 *  "24px var(--font-sans)"` is rejected, leaving the canvas at its default ~10px
 *  font, so the text measures FAR too narrow and the box collapses well below the
 *  content (the bug: a fresh text's `fontFamily` default IS `var(--font-sans)`). The
 *  renderer is fine (CSS resolves the var), so only measurement breaks. Resolve
 *  `var(--x[, fallback])` to a concrete family/stack against the document before
 *  measuring. A non-var family passes through unchanged. */
export function resolveCssFontFamily(family: string): string {
  const m = /^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/.exec(family.trim());
  if (m === null) return family;
  const fallback = m[2]?.trim();
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(m[1] ?? "")
      .trim();
    if (v.length > 0) return v;
  } catch {
    /* no DOM → use the var()'s own fallback */
  }
  return fallback !== undefined && fallback.length > 0 ? fallback : "sans-serif";
}

/** The browser text measurer (Pretext + Canvas2D), built once and reused, or
 *  `undefined` when disabled / unavailable (non-browser, no canvas). Wrapped to
 *  resolve CSS-variable font families before measuring (see `resolveCssFontFamily`)
 *  — this is the single point ALL engine text measurement (free-hug, Hug reflow,
 *  content-auto) flows through, so the fix is central. */
export function getEngineTextMeasurer(): MeasureText | undefined {
  if (!engineTextMeasureEnabled()) return undefined;
  if (cached === undefined) {
    try {
      const base = createBrowserTextMeasurer();
      cached = (spec) => base({ ...spec, fontFamily: resolveCssFontFamily(spec.fontFamily) });
    } catch {
      return undefined; // no canvas (e.g. SSR / blocked) → engine keeps geometry path
    }
  }
  return cached;
}

/** The `{ measureText }` slice to spread into a Hug-reflow input — `{}` when disabled
 *  so the optional field stays absent (exactOptionalPropertyTypes-safe). */
export function measureTextInput(): { readonly measureText?: MeasureText } {
  const m = getEngineTextMeasurer();
  return m !== undefined ? { measureText: m } : {};
}

/** WI-051 follow-up — FREE-placed text content hug. A text with no managing layout
 *  parent (absolute / root) is sized by its own frame; the engine does not own it,
 *  so the host fits the box to the measured content here. `maxWidthPx` present ⇒
 *  HEIGHT mode (fixed width, wrap → auto height: only `hRatio` is meaningful);
 *  absent ⇒ WIDTH_AND_HEIGHT (intrinsic: both axes hug). Returns parent-ratio
 *  width/height. Pure — takes the measurer so it is testable with a fake. */
export interface FreeTextHugSpec {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly maxWidthPx?: number;
}
export function freeTextHugRatio(
  measure: MeasureText,
  spec: FreeTextHugSpec,
  containerWPx: number,
  containerHPx: number,
): { readonly wRatio: number; readonly hRatio: number } | undefined {
  if (!(containerWPx > 0) || !(containerHPx > 0)) return undefined;
  if (!(spec.fontSizePx > 0)) return undefined;
  const r = measure({
    text: spec.text,
    fontFamily: spec.fontFamily,
    fontSizePx: spec.fontSizePx,
    ...(spec.lineHeight !== undefined ? { lineHeight: spec.lineHeight } : {}),
    ...(spec.letterSpacing !== undefined ? { letterSpacing: spec.letterSpacing } : {}),
    ...(spec.maxWidthPx !== undefined ? { maxWidthPx: spec.maxWidthPx } : {}),
  });
  if (!(r.widthPx > 0) || !(r.heightPx > 0)) return undefined;
  return { wRatio: r.widthPx / containerWPx, hRatio: r.heightPx / containerHPx };
}

/** Flag-gated wrapper over `freeTextHugRatio` using the engine text measurer.
 *  Returns undefined when disabled / no measurer (→ caller keeps the seeded frame). */
export function measureFreeTextHugRatio(
  spec: FreeTextHugSpec,
  containerWPx: number,
  containerHPx: number,
): { readonly wRatio: number; readonly hRatio: number } | undefined {
  const m = getEngineTextMeasurer();
  return m !== undefined ? freeTextHugRatio(m, spec, containerWPx, containerHPx) : undefined;
}

// NOTE — a measured grid-cell font-shrink that WROTE the shrunk font to the doc was
// trialed here + in `reparent-text-hug`, then REMOVED: a doc-written shrink is
// DESTRUCTIVE (loses the authored font → not reversible when the cell grows / text is
// deleted — the reason the original `shrinkFontTarget` was decommissioned). The shrink
// is intrinsically a derived value, so it lives at render: TextBlock computes it
// SYNCHRONOUSLY from model state (`ItemBoxContext` box + this measurer), DOM-free and
// reversible. See `TextBlock.tsx` (fitScale useMemo) + `text-autofit.ts` (`fitFontScale`).
