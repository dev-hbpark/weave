// WI-051 follow-up — content-hug a TEXT when it is REPARENTED into a new parent, so
// its box keeps its CONTENT size instead of shrinking when the ratio re-bases to a
// smaller parent (and instead of cross-stretching to fill a flex column — WI-238).
// The model measures the text in the NEW parent and the box is sized to the content;
// reparenting a content-hugged text then shows NO size change (content → content).
//
// Runs as extra patches AFTER the base reparent (which re-based the frame + preserved
// the ratio-font px), so these OVERRIDE the re-based width/height with the measured
// content size. Flag-gated (off ⇒ no patches → the WI-238 cross-stretch path stands).

import { resolveFontSize } from "@agocraft/core";
import { absoluteFrameBox, findItemDeep, findParentAndIndex } from "../agocraft-mirror.js";
import {
  engineTextMeasureEnabled,
  type FreeTextHugSpec,
  gridCellFontShrinkPx,
  measureFreeTextHugRatio,
} from "./text-measurer.js";

type Doc = Parameters<typeof absoluteFrameBox>[0];
interface AttrsPatch {
  readonly type: string;
  readonly itemId: unknown;
  readonly before?: unknown;
  readonly after?: { readonly frame?: { readonly width: number; readonly height: number } };
}

/** The post-base attrs for `itemId` (the last item.attrs patch's `after`), or undefined. */
function baseAttrsAfter(
  basePatches: ReadonlyArray<AttrsPatch>,
  itemId: string,
): Record<string, unknown> | undefined {
  for (let i = basePatches.length - 1; i >= 0; i -= 1) {
    const p = basePatches[i];
    if (p?.type === "item.attrs" && String(p.itemId) === itemId) {
      return p.after as Record<string, unknown>;
    }
  }
  return undefined;
}

/** Content-hug patches for each reparented TEXT (flag-gated). Empty when disabled /
 *  no measurer / non-text / no design basis. */
export function reparentTextHugPatches(
  doc: Doc,
  entries: ReadonlyArray<{ readonly itemId: string; readonly newParentId: string }>,
  basePatches: ReadonlyArray<unknown>,
  designW: number | undefined,
  designH: number | undefined,
): unknown[] {
  if (!engineTextMeasureEnabled()) return [];
  if (designW === undefined || designH === undefined || !(designW > 0) || !(designH > 0)) return [];
  const bp = basePatches as ReadonlyArray<AttrsPatch>;
  const out: unknown[] = [];
  for (const { itemId, newParentId } of entries) {
    const item = findItemDeep(doc, itemId);
    if (item === undefined || item.kind !== "text") continue;
    const parent = findItemDeep(doc, newParentId);
    const parentLayout = (parent?.attrs as { layout?: { kind?: string } } | undefined)?.layout;
    const box = absoluteFrameBox(doc, newParentId, designW, designH);
    if (box === null) continue;
    const a = item.attrs as Record<string, unknown>;
    // The font px is PRESERVED across the reparent (ratioFontReparentPatches re-bases
    // a ratio fontSizeSpec so the rendered px is unchanged). So measure at the font as
    // it renders NOW — resolved against the OLD parent's height — not the new parent's
    // (which would shrink a ratio font and mis-measure the content).
    const oldParent = findParentAndIndex(doc, itemId)?.parent;
    const oldBox = absoluteFrameBox(
      doc,
      oldParent !== undefined
        ? String(oldParent.id)
        : String((doc as { root: { id: unknown } }).root.id),
      designW,
      designH,
    );
    const fontSizePx = resolveFontSize(
      a.fontSizeSpec as never,
      a.fontSize as never,
      (oldBox ?? box).h,
    ) as number;
    const lhSpec = a.lineHeightSpec as { value?: number; unit?: string } | undefined;
    const lineHeight =
      lhSpec?.unit === "multiplier" && typeof lhSpec.value === "number"
        ? lhSpec.value
        : typeof a.lineHeight === "number"
          ? a.lineHeight
          : 1.4;
    const spec: FreeTextHugSpec = {
      text: typeof a.text === "string" ? a.text : "",
      fontFamily: typeof a.fontFamily === "string" ? a.fontFamily : "sans-serif",
      fontSizePx,
      lineHeight,
      letterSpacing: typeof a.letterSpacing === "number" ? a.letterSpacing : 0,
    };
    const hug = measureFreeTextHugRatio(spec, box.w, box.h);
    if (hug === undefined) continue;
    // The post-reparent attrs (re-based frame + ratio-font) are this patch's base.
    const baseAttrs = baseAttrsAfter(bp, String(itemId)) ?? a;
    const baseFrame = (baseAttrs.frame ?? a.frame) as Record<string, unknown> | undefined;
    if (baseFrame === undefined) continue;
    const layoutKind = parentLayout?.kind;
    const baseLc = baseAttrs.layoutChild as Record<string, unknown> | undefined;

    // auto-grid — a cell is TRACK-BOUND (the box cannot grow). When the content
    // overflows the cell, shrink the FONT (measured, written to the doc) so it fits the
    // cell and FILLS it — this is the engine/measurement successor to the render-time
    // `fitFontScale`, moving grid-cell font-shrink into the model (DR-156 future work).
    // When the content fits, keep the content-hug at start (box = content size).
    if (layoutKind === "auto-grid") {
      const cellWPx = (baseFrame.width as number) * box.w;
      const cellHPx = (baseFrame.height as number) * box.h;
      const shrunkPx = gridCellFontShrinkPx(spec, cellWPx, cellHPx);
      const gridLc = baseLc?.kind === "auto-grid" ? baseLc : { kind: "auto-grid" };
      const after: Record<string, unknown> =
        shrunkPx !== undefined
          ? {
              ...baseAttrs,
              fontSize: Math.round(shrunkPx),
              fontSizeSpec: { kind: "px", value: shrunkPx },
              layoutChild: { ...gridLc, justifySelf: "stretch", alignSelf: "stretch" },
            }
          : {
              ...baseAttrs,
              frame: { ...baseFrame, width: hug.wRatio, height: hug.hRatio },
              layoutChild: { ...gridLc, justifySelf: "start", alignSelf: "start" },
            };
      out.push({ type: "item.attrs", itemId: item.id, before: baseAttrs, after });
      continue;
    }

    // The content-hug child policy per parent kind:
    //  • auto-flex → grow:0 + basis:"auto" (main content-sized), NO alignSelf:"stretch"
    //    (cross stays content-sized) — replaces the WI-238 cross-stretch.
    //  • free / absolute → no layout policy; the frame override alone content-hugs it.
    const hugLayoutChild =
      layoutKind === "auto-flex"
        ? { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" }
        : undefined;
    const after: Record<string, unknown> = {
      ...baseAttrs,
      frame: { ...baseFrame, width: hug.wRatio, height: hug.hRatio },
      ...(hugLayoutChild !== undefined ? { layoutChild: hugLayoutChild } : {}),
    };
    out.push({ type: "item.attrs", itemId: item.id, before: baseAttrs, after });
  }
  return out;
}
