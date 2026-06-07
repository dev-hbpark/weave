// Ratio-font preservation on reparent (font-size kind fix, WI-135 / DR-086).
//
// A `fontSizeSpec.kind:'ratio'` resolves to `value × parentHeight`
// (resolve-font-size.ts). `weave.item.reparent` preserves an item's on-screen
// BOX (computeReparentFrameRatio) but the kit command does NOT touch the font —
// so moving a ratio-text into a DIFFERENT-height parent kept the box while the
// glyphs re-resolved, a box↔font mismatch (px fonts were already correct).
//
// Fix: re-base the ratio value so the rendered px is preserved
//   newValue = oldValue × oldParentHeightRatio / newParentHeightRatio
// (the design-height constant cancels). This is wired UNIVERSALLY by wrapping the
// `weave.item.reparent` command (commands.ts) — every caller (UI gesture, the
// Aku agent tool path, programmatic exec) gets it, in the SAME transaction as the
// reparent (one Cmd+Z). `ratioFontReparentPatches` builds the `item.attrs`
// patches to append to the command's base patches; it reads each moved item's
// FINAL attrs (post-reparent / post-layout frame) so the patch flips ONLY
// fontSizeSpec — no frame clobber, for absolute and layout parents alike.

import type { Document as AgocraftDocument, Patch } from "@agocraft/core";
import { findItemDeep, findParentAndIndex, frameHeightRatio } from "./agocraft-mirror.js";

export interface ReparentEntryInput {
  readonly itemId: string;
  readonly newParentId: string;
}

interface RatioFontUpdate {
  readonly itemId: string;
  readonly value: number;
}

function ratioFontValue(item: ReturnType<typeof findItemDeep>): number | undefined {
  const spec = (item?.attrs as { fontSizeSpec?: { kind?: unknown; value?: unknown } } | undefined)
    ?.fontSizeSpec;
  return spec?.kind === "ratio" && typeof spec.value === "number" ? spec.value : undefined;
}

/** For each reparent entry whose item carries a `kind:'ratio'` fontSize, the new
 *  value that PRESERVES the rendered px across the parent change:
 *  `newValue = oldValue × oldParentHeightRatio / newParentHeightRatio`.
 *  Entries that aren't ratio-text, or whose parent height is unchanged /
 *  unresolvable, are skipped. Pure. */
export function computeRatioFontReparentUpdates(
  doc: AgocraftDocument,
  entries: ReadonlyArray<ReparentEntryInput>,
): RatioFontUpdate[] {
  const out: RatioFontUpdate[] = [];
  for (const { itemId, newParentId } of entries) {
    const item = findItemDeep(doc, itemId);
    const value = ratioFontValue(item);
    if (value === undefined) continue;
    const parentInfo = findParentAndIndex(doc, itemId);
    const oldParentId =
      parentInfo !== undefined ? String(parentInfo.parent.id) : String(doc.root.id);
    if (oldParentId === String(newParentId)) continue;
    const oldH = frameHeightRatio(doc, oldParentId);
    const newH = frameHeightRatio(doc, String(newParentId));
    if (oldH === null || newH === null || newH === 0 || Math.abs(oldH - newH) < 1e-9) continue;
    out.push({ itemId, value: value * (oldH / newH) });
  }
  return out;
}

/** `item.attrs` patches that re-base ratio fonts, to APPEND to the reparent
 *  command's `basePatches` (same transaction, so undo is one step). Each reads
 *  the moved item's FINAL attrs after the base patches — a layout new-parent
 *  emits an `item.attrs` (fullAttrsPatch) for the moved item; otherwise the new
 *  frame comes from the `item.reparent` entry — so the emitted patch differs from
 *  the current attrs ONLY in `fontSizeSpec` (no frame clobber). */
export function ratioFontReparentPatches(
  doc: AgocraftDocument,
  entries: ReadonlyArray<ReparentEntryInput>,
  basePatches: ReadonlyArray<Patch>,
): Patch[] {
  const updates = computeRatioFontReparentUpdates(doc, entries);
  if (updates.length === 0) return [];
  const reparentPatch = basePatches.find((p) => p.type === "item.reparent");
  const out: Patch[] = [];
  for (const u of updates) {
    const item = findItemDeep(doc, u.itemId);
    if (item === undefined) continue;
    const idStr = String(item.id);
    const layoutAttrs = basePatches.find(
      (p): p is Extract<Patch, { type: "item.attrs" }> =>
        p.type === "item.attrs" && String(p.itemId) === idStr,
    );
    let finalAttrs: Record<string, unknown>;
    if (layoutAttrs !== undefined) {
      finalAttrs = { ...layoutAttrs.after };
    } else {
      const entry =
        reparentPatch?.type === "item.reparent"
          ? reparentPatch.entries.find((e) => String(e.itemId) === idStr)
          : undefined;
      const frame = entry?.newFrameRatio ?? (item.attrs as { frame?: unknown }).frame;
      finalAttrs = { ...item.attrs, frame };
    }
    out.push({
      type: "item.attrs",
      itemId: item.id,
      before: finalAttrs,
      after: { ...finalAttrs, fontSizeSpec: { kind: "ratio", value: u.value } },
    });
  }
  return out;
}
