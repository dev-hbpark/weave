// WI-245 / DR-162 — group-hug refit. A `group` kind (structure.hugsChildren)
// ALWAYS keeps its `frame` equal to the union bounding box of its children, so a
// child can never overflow (the Figma group model). Whenever a child's geometry
// or the child set changes, the group's box is recomputed to the children's
// union and each child's parent-relative `frame` is re-relativized to the new
// box (absolute positions preserved).
//
// Pure ratio math — composition of parent-relative ratio boxes is affine, so no
// design-px is needed. Child rotation is preserved; the union ignores rotation
// (a rotated child's corners may overhang slightly — the same caveat as
// weave.items.group's bbox). This is weave-level: the engine's Hug
// (refitHugContainer) is flex/grid-layout-specific and does not apply to a
// group's absolutely-positioned children.

import type { Document as AgocraftDocument, Patch } from "@agocraft/core";
import { findItemDeep } from "../agocraft-mirror.js";
import { isContainerKind, structureOf } from "../domain-kinds.js";
import type { DomainKind, ItemFrame } from "../types.js";

const FLOOR = 0.0001;
const EPS = 1e-6;

export interface GroupRefit {
  readonly groupFrame: ItemFrame;
  readonly childFrames: ReadonlyArray<{ readonly itemId: string; readonly frame: ItemFrame }>;
}

/** A child's box in the group's PARENT space (id + unrotated rect + rotation). */
export interface ChildParentBox {
  readonly itemId: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
}

/** Compose a child's parent-relative `frame` with a `box` (its container's frame,
 *  in the container's-parent space) → the child's box in that outer space. */
export function composeChildBox(box: ItemFrame, childId: string, child: ItemFrame): ChildParentBox {
  return {
    itemId: childId,
    x: box.x + child.x * box.width,
    y: box.y + child.y * box.height,
    w: child.width * box.width,
    h: child.height * box.height,
    rotation: child.rotation,
  };
}

/** Tight union of child boxes (already in the group's PARENT space) + each child
 *  re-relativized to that union. The reference frame for the new group box's
 *  rotation is `rotation` (the group keeps its own rotation). Null if empty. */
export function refitGroupFromParentBoxes(
  boxes: ReadonlyArray<ChildParentBox>,
  rotation: number,
): GroupRefit | null {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((a) => a.x));
  const minY = Math.min(...boxes.map((a) => a.y));
  const maxX = Math.max(...boxes.map((a) => a.x + a.w));
  const maxY = Math.max(...boxes.map((a) => a.y + a.h));
  const nf: ItemFrame = {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, FLOOR),
    height: Math.max(maxY - minY, FLOOR),
    rotation,
  };
  const childFrames = boxes.map((a) => ({
    itemId: a.itemId,
    frame: {
      x: (a.x - nf.x) / nf.width,
      y: (a.y - nf.y) / nf.height,
      width: a.w / nf.width,
      height: a.h / nf.height,
      rotation: a.rotation,
    } satisfies ItemFrame,
  }));
  return { groupFrame: nf, childFrames };
}

/** Tight union box of a group's children (in the group's PARENT space) + each
 *  child re-relativized to it. Returns null for an empty group. */
export function refitGroupFrames(
  groupFrame: ItemFrame,
  children: ReadonlyArray<{ readonly itemId: string; readonly frame: ItemFrame }>,
): GroupRefit | null {
  return refitGroupFromParentBoxes(
    children.map((c) => composeChildBox(groupFrame, c.itemId, c.frame)),
    groupFrame.rotation,
  );
}

function frameClose(a: ItemFrame, b: ItemFrame): boolean {
  return (
    Math.abs(a.x - b.x) < EPS &&
    Math.abs(a.y - b.y) < EPS &&
    Math.abs(a.width - b.width) < EPS &&
    Math.abs(a.height - b.height) < EPS
  );
}

/** Build `item.attrs` frame patches for a refit, EMITTING ONLY the items whose
 *  frame actually changed vs the doc (per-item no-op guard so unrelated edits /
 *  unchanged siblings don't pollute history). */
function buildRefitPatches(
  doc: AgocraftDocument,
  group: ReturnType<typeof findItemDeep>,
  refit: GroupRefit,
): Patch[] {
  if (group === undefined) return [];
  const out: Patch[] = [];
  const curGroupFrame = (group.attrs as { frame?: ItemFrame }).frame;
  if (curGroupFrame !== undefined && !frameClose(refit.groupFrame, curGroupFrame)) {
    out.push({
      type: "item.attrs",
      itemId: group.id,
      before: group.attrs,
      after: { ...group.attrs, frame: refit.groupFrame },
    } as Patch);
  }
  for (const cf of refit.childFrames) {
    const child = findItemDeep(doc, cf.itemId);
    if (child === undefined) continue;
    const cur = (child.attrs as { frame?: ItemFrame }).frame;
    if (cur !== undefined && frameClose(cf.frame, cur)) continue; // unchanged child
    out.push({
      type: "item.attrs",
      itemId: child.id,
      before: child.attrs,
      after: { ...child.attrs, frame: cf.frame },
    } as Patch);
  }
  return out;
}

function hugGroup(doc: AgocraftDocument, groupId: string) {
  const group = findItemDeep(doc, groupId);
  if (group === undefined || !isContainerKind(group.kind)) return undefined;
  const s = structureOf(group.kind as DomainKind);
  if (!s.isContainer || !s.hugsChildren) return undefined;
  if ((group.children?.length ?? 0) === 0) return undefined;
  if ((group.attrs as { frame?: ItemFrame }).frame === undefined) return undefined;
  return group;
}

/** Patches that re-fit a hugging container (`structure.hugsChildren`) to its
 *  children's union box. Empty when the item does not hug, has no children, or
 *  is already tight. Read against the doc that already reflects the triggering
 *  mutation (a child added / removed / a NON-gesture frame change). */
export function groupHugPatches(doc: AgocraftDocument, groupId: string): Patch[] {
  const group = hugGroup(doc, groupId);
  if (group === undefined) return [];
  const groupFrame = (group.attrs as { frame: ItemFrame }).frame;
  const refit = refitGroupFrames(
    groupFrame,
    (group.children ?? []).map((c) => ({
      itemId: String(c.id),
      frame: (c.attrs as { frame: ItemFrame }).frame,
    })),
  );
  if (refit === null) return [];
  return buildRefitPatches(doc, group, refit);
}

/** LIVE-gesture re-fit. The dragged child's parent-space box is computed from the
 *  GESTURE-START group frame `g0` (cached by sessionId by the caller), so the
 *  refit stays consistent even as the group box grows tick-to-tick — the move
 *  binding computes the child's frame relative to g0, not the live group box.
 *  Other children use the current group frame (their re-relativized frames
 *  preserve absolute position, so that reference is stable). Per-item no-op
 *  guard still applies; the dragged child is corrected whenever the live group
 *  box has drifted from g0. */
export function groupHugLivePatches(
  doc: AgocraftDocument,
  groupId: string,
  draggedChildId: string,
  g0: ItemFrame,
): Patch[] {
  const group = hugGroup(doc, groupId);
  if (group === undefined) return [];
  const curFrame = (group.attrs as { frame: ItemFrame }).frame;
  const boxes = (group.children ?? []).map((c) => {
    const fr = (c.attrs as { frame: ItemFrame }).frame;
    const base = String(c.id) === draggedChildId ? g0 : curFrame;
    return composeChildBox(base, String(c.id), fr);
  });
  const refit = refitGroupFromParentBoxes(boxes, curFrame.rotation);
  if (refit === null) return [];
  return buildRefitPatches(doc, group, refit);
}
