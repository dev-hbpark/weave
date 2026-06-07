// Ratio-font preservation on reparent (font-size kind fix).
//
// `weave.item.reparent` preserves an item's on-screen BOX (computeReparentFrameRatio),
// but a `fontSizeSpec.kind:'ratio'` resolves to `value × parentHeight`
// (resolve-font-size.ts), and the raw command does NOT touch the font. So moving
// a ratio-text into a DIFFERENT-height parent kept the box but rescaled the
// glyphs — violating the command's "preserve on-screen position" contract
// (px-kind fonts were already correct). Operator decision (2026-06-07): preserve
// visual size by converting the ratio value.
//
// We keep the conversion OUT of the core kit command (no agocraft change /
// re-vendor) by running it next to the gesture: `reparentPreservingRatioFont`
// wraps the reparent + a follow-up `weave.item.update` in ONE `editor.runBatch`
// transaction (single Cmd+Z). The update runs AFTER the reparent, so it reads
// the moved item's post-reparent attrs (new frame) and merges only the
// fontSizeSpec value — no frame clobber, works for absolute and layout parents.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { findItemDeep, findParentAndIndex, frameHeightRatio } from "./agocraft-mirror.js";

export interface ReparentEntryInput {
  readonly itemId: string;
  readonly newParentId: string;
}

interface RatioFontUpdate {
  readonly itemId: string;
  readonly value: number;
}

interface RatioSpec {
  readonly kind: "ratio";
  readonly value: number;
}

function ratioFontSpec(item: ReturnType<typeof findItemDeep>): RatioSpec | undefined {
  const spec = (item?.attrs as { fontSizeSpec?: { kind?: unknown; value?: unknown } } | undefined)
    ?.fontSizeSpec;
  if (spec?.kind === "ratio" && typeof spec.value === "number") {
    return { kind: "ratio", value: spec.value };
  }
  return undefined;
}

/** For each reparent entry whose item carries a `kind:'ratio'` fontSize, the new
 *  value that PRESERVES the rendered px across the parent change:
 *  `newValue = oldValue × oldParentHeightRatio / newParentHeightRatio`
 *  (the design-height constant cancels). Entries that aren't ratio-text, or
 *  whose parent height is unchanged / unresolvable, are skipped. Pure. */
export function computeRatioFontReparentUpdates(
  doc: AgocraftDocument,
  entries: ReadonlyArray<ReparentEntryInput>,
): RatioFontUpdate[] {
  const out: RatioFontUpdate[] = [];
  for (const { itemId, newParentId } of entries) {
    const item = findItemDeep(doc, itemId);
    const spec = ratioFontSpec(item);
    if (spec === undefined) continue;
    const parentInfo = findParentAndIndex(doc, itemId);
    const oldParentId =
      parentInfo !== undefined ? String(parentInfo.parent.id) : String(doc.root.id);
    if (oldParentId === String(newParentId)) continue;
    const oldH = frameHeightRatio(doc, oldParentId);
    const newH = frameHeightRatio(doc, String(newParentId));
    if (oldH === null || newH === null || newH === 0 || Math.abs(oldH - newH) < 1e-9) continue;
    out.push({ itemId, value: spec.value * (oldH / newH) });
  }
  return out;
}

/** Reparent `entries`, preserving each ratio-text's on-screen size by converting
 *  its `fontSizeSpec` value in the SAME undo transaction. Drop-in for a bare
 *  `editor.exec("weave.item.reparent", …)` at a UI gesture. */
export function reparentPreservingRatioFont(
  editor: Editor,
  doc: AgocraftDocument,
  entries: ReadonlyArray<ReparentEntryInput>,
  designSize?: { readonly width: number; readonly height: number },
): void {
  const updates = computeRatioFontReparentUpdates(doc, entries);
  const reparentInput = {
    entries,
    ...(designSize !== undefined
      ? { designWidth: designSize.width, designHeight: designSize.height }
      : {}),
  };
  if (updates.length === 0) {
    editor.exec("weave.item.reparent", reparentInput);
    return;
  }
  editor.runBatch(() => {
    editor.exec("weave.item.reparent", reparentInput);
    for (const u of updates) {
      editor.exec("weave.item.update", {
        itemId: u.itemId,
        // Reads the POST-reparent item (new frame intact) and merges only the
        // converted fontSizeSpec — no frame clobber.
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, fontSizeSpec: { kind: "ratio", value: u.value } },
        }),
      });
    }
  });
}
