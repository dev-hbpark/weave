// WI-248 / DR-164 — group-hug transaction effect.
//
// Folds the WI-245/246 inline group-hug decorators into the registered pipeline
// (HANDOFF-003). Reacts to the PRIMARY patches a hug must follow:
//   • `item.attrs` — a child's frame moved/resized → re-fit the child's group so
//     it shrink-wraps the union (no overflow). A LIVE gesture (`meta.sessionId`)
//     uses the gesture-start group box (`groupHugLivePatches`) so the box does not
//     drift/balloon as it grows; a one-shot edit uses the live doc.
//   • `item.create` — a child added into a hugging group → grow the group to wrap.
//
// Loop-free: it reacts to the command's PRIMARY patches only (the changed child),
// never to its own emitted group/child refit patches. The refit fns
// (`groupHugPatches` / `groupHugLivePatches`) gate on `structure.hugsChildren`,
// so non-hugging parents (frames) are no-ops.

import { type CommandContext, itemId as makeItemId, type Patch } from "@agocraft/core";
import { applyChangeToDocument, findItemDeep, findParentAndIndex } from "../agocraft-mirror.js";
import { groupHugLivePatches, groupHugPatches } from "../layout/refit-group.js";
import { ok } from "../result.js";
import type { ItemFrame } from "../types.js";
import type { TransactionEffect } from "./transaction-effect.js";

// Blocker 4 — per-gesture group-start box, relocated from the `buildWeaveCommands`
// closure to a module singleton. weave runs one editor per session, so a module
// Map is equivalent to the former closure Map.
const gestureGroupG0 = new Map<string, { groupId: string; g0: ItemFrame }>();

function gestureStartBox(
  sessionId: string,
  groupId: string,
  doc: CommandContext["document"],
): ItemFrame | undefined {
  const hit = gestureGroupG0.get(sessionId);
  if (hit !== undefined && hit.groupId === groupId) return hit.g0;
  const group = findItemDeep(doc, groupId);
  const g0 = (group?.attrs as { frame?: ItemFrame } | undefined)?.frame;
  if (g0 === undefined) return undefined;
  if (gestureGroupG0.size > 16) gestureGroupG0.clear(); // bound (one gesture at a time)
  gestureGroupG0.set(sessionId, { groupId, g0 });
  return g0;
}

const applyAll = (doc: CommandContext["document"], patches: ReadonlyArray<Patch>) => {
  let d = doc;
  for (const p of patches) {
    d = applyChangeToDocument(d, p as unknown as Parameters<typeof applyChangeToDocument>[1]);
  }
  return d;
};

const patchType = (p: Patch): string | undefined => (p as { type?: string }).type;

export const groupHugEffect: TransactionEffect = {
  name: "group-hug",
  reactsTo: ["item.attrs", "item.create"],
  derive(ctx, patches, meta) {
    // Geometry is live once the primary patches are applied.
    let workingDoc = applyAll(ctx.document, patches);
    const out: Patch[] = [];
    const refittedOneShot = new Set<string>();
    const liveDone = new Set<string>();
    const emit = (hug: ReadonlyArray<Patch>) => {
      if (hug.length === 0) return;
      out.push(...hug);
      workingDoc = applyAll(workingDoc, hug);
    };

    for (const p of patches) {
      const type = patchType(p);
      if (type === "item.attrs") {
        const id = String((p as { itemId: unknown }).itemId);
        const info = findParentAndIndex(ctx.document, makeItemId(id));
        if (info === undefined) continue;
        const groupId = String(info.parent.id);
        if (meta.sessionId !== undefined) {
          if (liveDone.has(groupId)) continue;
          const g0 = gestureStartBox(meta.sessionId, groupId, ctx.document);
          if (g0 === undefined) continue;
          liveDone.add(groupId);
          emit(groupHugLivePatches(workingDoc, groupId, id, g0));
        } else if (!refittedOneShot.has(groupId)) {
          refittedOneShot.add(groupId);
          emit(groupHugPatches(workingDoc, groupId));
        }
      } else if (type === "item.create") {
        const parentId = String((p as { parentId: unknown }).parentId);
        if (refittedOneShot.has(parentId)) continue;
        refittedOneShot.add(parentId);
        emit(groupHugPatches(workingDoc, parentId));
      }
    }
    return ok(out);
  },
};
