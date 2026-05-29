// WI-019 Phase 2 — ZOrderCapability adapter for weave's Frame / primitive items.
//
// Stacking context = the item's position in its DIRECT parent's `children`
// array (root for a top-level frame, the containing frame for a nested
// primitive). The same adapter serves every registered kind (see
// `zorder/register.ts`); only the kind dispatch differs at registration time.
//
// WI-022 / DR-025 S1 — z-order adoption. The four directional operations now
// return REAL `item.children.reorder` Patches (the variant landed via
// HANDOFF-007), built by splicing the item within its direct parent. This is
// the single source of the reorder mutation: `weave.item.bringForward` /
// `sendBackward` / `bringToFront` / `sendToBack` delegate to the
// `agocraft.zOrder.*` commands, which dispatch here. (Peek-mode's local-stack
// commit still flows through `weave.design.reorderChildren`, so
// `reorderLocalStack` / `setZ` remain no-ops here until a consumer needs them.)

import type { Document, Item, ItemId, Patch } from "@agocraft/core";
import { createZOrderAdapter, type ZOrderCapability } from "@agocraft/core";
import { findParentAndIndex } from "../agocraft-mirror.js";

export interface DesignFrameZOrderAdapterDeps {
  /** Resolves the current document. Called on every adapter invocation. */
  readonly getDocument: () => Document;
}

function sameOrder(a: ReadonlyArray<ItemId>, b: ReadonlyArray<ItemId>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createDesignFrameZOrderAdapter(
  deps: DesignFrameZOrderAdapterDeps,
): ZOrderCapability {
  function readZ(itemId: string): number {
    const root = deps.getDocument().root;
    return root.children.findIndex((c) => String(c.id) === itemId);
  }

  /** Build a single `item.children.reorder` Patch that moves the child at
   *  `fromIdx` to `toIdx` within `parent`. Empty Patch[] on a no-op. */
  function reorderWithin(parent: Item, fromIdx: number, toIdx: number): ReadonlyArray<Patch> {
    if (fromIdx < 0 || fromIdx === toIdx) return [];
    const before: ItemId[] = parent.children.map((c) => c.id);
    const after = [...before];
    const [moved] = after.splice(fromIdx, 1);
    if (moved === undefined) return [];
    after.splice(toIdx, 0, moved);
    if (sameOrder(before, after)) return [];
    return [{ type: "item.children.reorder", itemId: parent.id, before, after }];
  }

  /** Splice `id` to sit immediately adjacent to `targetId` in their shared
   *  parent — `delta = 1` lands it just ABOVE (higher index), `delta = 0`
   *  just BELOW. Empty Patch[] when they are not siblings or it's a no-op. */
  function spliceBeside(id: string, targetId: string, delta: 0 | 1): ReadonlyArray<Patch> {
    const found = findParentAndIndex(deps.getDocument(), id);
    if (found === undefined) return [];
    const before: ItemId[] = found.parent.children.map((c) => c.id);
    const after = [...before];
    const [moved] = after.splice(found.indexInParent, 1);
    if (moved === undefined) return [];
    const targetIdx = after.findIndex((x) => String(x) === targetId);
    if (targetIdx < 0) return [];
    after.splice(targetIdx + delta, 0, moved);
    if (sameOrder(before, after)) return [];
    return [{ type: "item.children.reorder", itemId: found.parent.id, before, after }];
  }

  function moveToTop(itemId: string): ReadonlyArray<Patch> {
    const found = findParentAndIndex(deps.getDocument(), itemId);
    if (found === undefined) return [];
    return reorderWithin(found.parent, found.indexInParent, found.parent.children.length - 1);
  }

  function moveToBottom(itemId: string): ReadonlyArray<Patch> {
    const found = findParentAndIndex(deps.getDocument(), itemId);
    if (found === undefined) return [];
    return reorderWithin(found.parent, found.indexInParent, 0);
  }

  function moveAbove(itemId: string, targetId: string): ReadonlyArray<Patch> {
    return spliceBeside(itemId, targetId, 1);
  }

  function moveBelow(itemId: string, targetId: string): ReadonlyArray<Patch> {
    return spliceBeside(itemId, targetId, 0);
  }

  // setZ (absolute numeric z) is unused by weave's index/splice-based z-order
  // commands — kept as a no-op until a consumer needs it.
  function writeZ(_itemId: string, _z: number): ReadonlyArray<Patch> {
    return [];
  }

  // Peek-mode commits its local-stack reorder through
  // `weave.design.reorderChildren`, not this path — no-op here.
  function reorderLocalStack(_orderedAsc: ReadonlyArray<string>): ReadonlyArray<Patch> {
    return [];
  }

  function listSiblings(itemId: string): ReadonlyArray<string> {
    const root = deps.getDocument().root;
    const me = root.children.find((c) => String(c.id) === itemId);
    if (!me) return [];
    return root.children.map((c) => String(c.id));
  }

  return createZOrderAdapter({
    readZ,
    writeZ,
    reorderLocalStack,
    moveToTop,
    moveToBottom,
    moveAbove,
    moveBelow,
    listSiblings,
  });
}
