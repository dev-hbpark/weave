// WI-248 / DR-164 — group dissolve-on-underflow transaction effect.
//
// Folds the WI-242 A3 inline `dissolveUnderflowingGroups` decorator into the
// registered pipeline (HANDOFF-003). Reacts to `item.remove`: after a child is
// removed, each affected container is maintained in the SAME transaction —
//   • a dissolving container (`structure.onUnderflow === "dissolve"`) that fell
//     below `minChildren` is dissolved: its survivors reparent to its OWN parent
//     and the emptied container is removed (auto-ungroup);
//   • a hugging container still at/above min shrink-wraps to its survivors.
//
// `dissolveFramePatches` is the pure form of commands.ts's
// `weave.frame.removeKeepingChildren` (blocker 5): the @agocraft/core dissolve
// kit (reparent children → own parent + remove emptied frame) + WI-135
// ratio-font / content-hug rebase. A separate kit instance is self-contained and
// emits the SAME patches the command does — behaviour-neutral.

import {
  type CommandContext,
  createDissolveFrameCommand,
  itemId as makeItemId,
  type Patch,
} from "@agocraft/core";
import {
  applyChangeToDocument,
  computeReparentFrameRatio,
  findItemDeep,
  findParentAndIndex,
} from "../agocraft-mirror.js";
import { isContainerKind, structureOf } from "../domain-kinds.js";
import { getDesignDims } from "../layout/design-dims.js";
import { groupHugPatches } from "../layout/refit-group.js";
import { reparentTextHugPatches } from "../layout/reparent-text-hug.js";
import { ratioFontReparentPatches } from "../reparent-font.js";
import { ok } from "../result.js";
import type { DomainKind } from "../types.js";
import type { TransactionEffect } from "./transaction-effect.js";

const dissolveFrameKit = createDissolveFrameCommand({
  name: "weave.frame.removeKeepingChildren",
  computeFrameRatio: computeReparentFrameRatio,
});

/** Pure dissolve: reparent the frame's children to its OWN parent + remove the
 *  emptied frame + WI-135 ratio-font / content-hug rebase. Mirrors commands.ts's
 *  `removeFrameKeepingChildren` wrapper exactly. Read against `ctx.document`
 *  (which the caller sets to the working doc). */
function dissolveFramePatches(ctx: CommandContext, frameId: string): Patch[] {
  const base = dissolveFrameKit.run(ctx, { frameId } as never);
  if (!base.ok || base.patches.length === 0) return [];
  const frame = findItemDeep(ctx.document, frameId);
  const parentInfo = findParentAndIndex(ctx.document, makeItemId(frameId));
  const newParentId =
    parentInfo !== undefined ? String(parentInfo.parent.id) : String(ctx.document.root.id);
  const entries = (frame?.children ?? []).map((c) => ({ itemId: String(c.id), newParentId }));
  const fontPatches = ratioFontReparentPatches(ctx.document, entries, base.patches);
  const dims = getDesignDims();
  const hugPatches = reparentTextHugPatches(
    ctx.document,
    entries,
    base.patches,
    dims?.w,
    dims?.h,
  ) as ReadonlyArray<Patch>;
  return [...base.patches, ...fontPatches, ...hugPatches];
}

const applyAll = (doc: CommandContext["document"], patches: ReadonlyArray<Patch>) => {
  let d = doc;
  for (const p of patches) {
    d = applyChangeToDocument(d, p as unknown as Parameters<typeof applyChangeToDocument>[1]);
  }
  return d;
};

export const groupDissolveEffect: TransactionEffect = {
  name: "group-dissolve",
  reactsTo: ["item.remove"],
  derive(ctx, patches, _meta) {
    const parentIds = new Set<string>();
    for (const p of patches) {
      if ((p as { type?: string }).type === "item.remove") {
        parentIds.add(String((p as { parentId: unknown }).parentId));
      }
    }
    if (parentIds.size === 0) return ok([]);
    let workingDoc = applyAll(ctx.document, patches);
    const out: Patch[] = [];
    for (const parentId of parentIds) {
      const parent = findItemDeep(workingDoc, parentId);
      if (parent === undefined || !isContainerKind(parent.kind)) continue;
      const s = structureOf(parent.kind as DomainKind);
      if (!s.isContainer) continue;
      const childCount = parent.children?.length ?? 0;
      if (s.onUnderflow === "dissolve" && childCount < s.minChildren) {
        const dissolved = dissolveFramePatches({ ...ctx, document: workingDoc }, parentId);
        if (dissolved.length > 0) {
          out.push(...dissolved);
          workingDoc = applyAll(workingDoc, dissolved);
        }
      } else if (s.hugsChildren && childCount > 0) {
        const hug = groupHugPatches(workingDoc, parentId);
        if (hug.length > 0) {
          out.push(...hug);
          workingDoc = applyAll(workingDoc, hug);
        }
      }
    }
    return ok(out);
  },
};
