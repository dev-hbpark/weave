// WI-text-size-unify (DR-093) — fontSizeSpec is the SINGLE source of truth.
//
// A text's size lives in `fontSizeSpec` ({ kind:'px'|'ratio', value }). The
// legacy `fontSize` (a bare px number) is a WRITE-ONLY MIRROR kept for agocraft
// schema / round-trip compatibility — it is never READ as a source of truth in
// weave UI or logic (reading it was the drift that made the toolbar show a stale
// px next to a ratio kind, and the agent's px/ratio confusion). Every reader
// goes through `displayFontSizePx`; every px writer goes through
// `fontSizeAttrsForPx`, which keeps the spec authoritative AND the mirror synced.

import { resolveFontSize } from "@agocraft/core";

interface FontSizeBearing {
  readonly fontSize?: number;
  readonly fontSizeSpec?: { readonly kind: "px" | "ratio"; readonly value: number };
}

/** The px the UI should DISPLAY / the renderer paints for a text's size —
 *  resolved from the authoritative `fontSizeSpec` (ratio × parentHeight, or the
 *  px value), NOT the bare legacy `fontSize` mirror. Mirrors `TextBlock`'s own
 *  `resolveFontSize` call so the toolbar number always equals the rendered size. */
export function displayFontSizePx(attrs: FontSizeBearing, parentHeightPx: number): number {
  return resolveFontSize(attrs.fontSizeSpec, attrs.fontSize ?? 24, parentHeightPx);
}

/** The next `{ fontSize, fontSizeSpec }` for a px-valued size edit that PRESERVES
 *  the current kind: a `ratio` text stays responsive (value = px ÷ parentHeight),
 *  a `px` (or spec-less) text stays absolute. The legacy `fontSize` mirror is
 *  always set to the px so it never drifts from the spec. */
export function fontSizeAttrsForPx(
  attrs: FontSizeBearing,
  px: number,
  parentHeightPx: number,
): { fontSize: number; fontSizeSpec: { kind: "px" | "ratio"; value: number } } {
  if (attrs.fontSizeSpec?.kind === "ratio" && parentHeightPx > 0) {
    return { fontSize: px, fontSizeSpec: { kind: "ratio", value: px / parentHeightPx } };
  }
  return { fontSize: px, fontSizeSpec: { kind: "px", value: px } };
}
