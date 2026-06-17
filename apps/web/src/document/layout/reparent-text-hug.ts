// WI-051 follow-up — content-hug a TEXT when it is REPARENTED into a new parent, so
// its box keeps its CONTENT size instead of shrinking when the ratio re-bases to a
// smaller parent (and instead of cross-stretching to fill a flex column — WI-238).
// The model measures the text in the NEW parent and the box is sized to the content;
// reparenting a content-hugged text then shows NO size change (content → content).
//
// Runs as extra patches AFTER the base reparent (which re-based the frame + preserved
// the ratio-font px), so these OVERRIDE the re-based width/height with the measured
// content size. Flag-gated (off ⇒ no patches → the WI-238 cross-stretch path stands).

import { absoluteFrameBox, findItemDeep, findParentAndIndex } from "../agocraft-mirror.js";
import { textHugChildPolicy, textHugFrameRatio } from "./text-layout-fit.js";
import { engineTextMeasureEnabled } from "./text-measurer.js";

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
    const layoutKind = parentLayout?.kind;

    // auto-grid — a cell is TRACK-BOUND and the engine's DEFAULT cell alignment is
    // `stretch`, so a reparented grid text already FILLS its cell (box = cell). We do
    // NOT content-hug it (that would set box = content and overflow the track). The
    // font shrink-to-fit, when the content exceeds the cell, is computed at render
    // SYNCHRONOUSLY from the model (TextBlock + ItemBoxContext + the engine measurer),
    // reversibly — so there is nothing to write here. Skip → let the engine stand.
    if (layoutKind === "auto-grid") continue;

    // The font px is PRESERVED across the reparent (ratioFontReparentPatches re-bases a
    // ratio fontSizeSpec so the rendered px is unchanged). So the shared measure resolves
    // a ratio font against the OLD parent's height (its rendered px), not the new
    // parent's (which would shrink a ratio font and mis-measure the content).
    const oldParent = findParentAndIndex(doc, itemId)?.parent;
    const oldBox = absoluteFrameBox(
      doc,
      oldParent !== undefined
        ? String(oldParent.id)
        : String((doc as { root: { id: unknown } }).root.id),
      designW,
      designH,
    );
    // DR-157 — the SINGLE shared measure + policy (same as add / paste).
    const hug = textHugFrameRatio(a, box, (oldBox ?? box).h);
    if (hug === undefined) continue;
    // The post-reparent attrs (re-based frame + ratio-font) are this patch's base.
    const baseAttrs = baseAttrsAfter(bp, String(itemId)) ?? a;
    const baseFrame = (baseAttrs.frame ?? a.frame) as Record<string, unknown> | undefined;
    if (baseFrame === undefined) continue;
    const hugLayoutChild = textHugChildPolicy(layoutKind);
    const after: Record<string, unknown> = {
      ...baseAttrs,
      frame: { ...baseFrame, width: hug.width, height: hug.height },
      ...(hugLayoutChild !== undefined ? { layoutChild: hugLayoutChild } : {}),
    };
    out.push({ type: "item.attrs", itemId: item.id, before: baseAttrs, after });
  }
  return out;
}
