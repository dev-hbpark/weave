// DR-157 — the SINGLE source of truth for "how a TEXT sizes itself when it enters a
// layout container". add (item.add) / paste (clipboardPastePlaced) / reparent
// (reparentTextHugPatches) all delegate here so a fix lands once and the three paths
// never drift again (the operator-reported add-vs-reparent divergence).
//
// Two decisions live here, nothing else:
//   • textHugFrameRatio — the shared MEASURE (attrs → spec → content-hug frame ratio).
//   • textHugChildPolicy — the shared per-parent-kind child POLICY.

import { resolveFontSize } from "@agocraft/core";
import { type FreeTextHugSpec, measureFreeTextHugRatio } from "./text-measurer.js";

/** A text item's attrs → the measurer spec, resolving the font px against the supplied
 *  basis height (matches the renderer's ratio-font resolution) and deriving the
 *  line-height multiplier from `lineHeightSpec` / legacy `lineHeight`. */
function textHugSpec(attrs: Record<string, unknown>, fontBasisHeightPx: number): FreeTextHugSpec {
  const fontSizePx = resolveFontSize(
    attrs.fontSizeSpec as never,
    attrs.fontSize as never,
    fontBasisHeightPx,
  ) as number;
  const lhSpec = attrs.lineHeightSpec as { value?: number; unit?: string } | undefined;
  const lineHeight =
    lhSpec?.unit === "multiplier" && typeof lhSpec.value === "number"
      ? lhSpec.value
      : typeof attrs.lineHeight === "number"
        ? attrs.lineHeight
        : 1.4;
  return {
    text: typeof attrs.text === "string" ? attrs.text : "",
    fontFamily: typeof attrs.fontFamily === "string" ? attrs.fontFamily : "sans-serif",
    fontSizePx,
    lineHeight,
    letterSpacing: typeof attrs.letterSpacing === "number" ? attrs.letterSpacing : 0,
  };
}

/** THE shared measure — the content-hug frame (parent-ratio width/height) for a text
 *  item entering a container of `containerBoxPx`. `fontBasisHeightPx` is the height a
 *  ratio fontSize resolves against: the container height for add/paste (a NEW text), the
 *  OLD parent height for reparent (a reparented ratio-font is preserved, so it must be
 *  measured at its rendered px). Returns undefined when measurement is off / unavailable
 *  / degenerate (caller keeps the seeded frame). */
export function textHugFrameRatio(
  attrs: Record<string, unknown>,
  containerBoxPx: { readonly w: number; readonly h: number },
  fontBasisHeightPx: number,
): { readonly width: number; readonly height: number } | undefined {
  const hug = measureFreeTextHugRatio(
    textHugSpec(attrs, fontBasisHeightPx),
    containerBoxPx.w,
    containerBoxPx.h,
  );
  return hug !== undefined ? { width: hug.wRatio, height: hug.hRatio } : undefined;
}

/** THE shared per-parent child policy for a content-hugged text:
 *  • auto-flex → content-hug both axes (`basis:"auto"`, no `crossSize`) so the box hugs
 *    AND `engineHugged` keeps the render font shrink-to-fit OFF (the box is the content).
 *  • auto-grid → undefined: keep the engine's default cell `stretch`; the box is the
 *    cell and the DOM-free render shrink-to-fit handles overflow (DR-156).
 *  • free / absolute / no layout → undefined: the frame override alone hugs it. */
export function textHugChildPolicy(
  parentLayoutKind: string | undefined,
):
  | { readonly kind: "auto-flex"; readonly grow: 0; readonly shrink: 1; readonly basis: "auto" }
  | undefined {
  return parentLayoutKind === "auto-flex"
    ? { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" }
    : undefined;
}
