// WI-039 — Frame-tree helpers for the "Move to…" picker (P2 E surface).
//
// Builds a flat list of `{ id, label, depth, disabled }` from the doc
// tree so the ContextMenu sub-menu can render the available reparent
// targets in document order with indentation. Pure — no React, no DOM.

import type {
  Document as AgocraftDocument,
  Item as AgocraftItem,
} from "@agocraft/core";
import { findDescendantSet } from "../agocraft-mirror.js";

export interface FrameTreeNode {
  /** Item id, or the literal string `"@root"` for the design root row. */
  readonly id: string;
  /** Display label — `attrs.name` if set, otherwise a kind-prefixed
   *  short id. The root row uses a localized "Design root" string. */
  readonly label: string;
  /** Nesting depth: 0 = root, 1 = direct children of root, etc. */
  readonly depth: number;
  /** True when this row would create a cycle (the moved item itself or
   *  any of its descendants). The picker renders these as `disabled`. */
  readonly disabled: boolean;
}

/** Build a flat depth-first list of every frame in `doc`, augmented with
 *  a synthetic root row at depth 0. Cycle-blocked targets (the moved
 *  item itself + all its descendants) are marked `disabled` rather than
 *  filtered out — the picker dims them so the user still understands
 *  the tree's full shape.
 *
 *  `movedItemIds` is the selection the reparent gesture would apply
 *  to (the right-clicked frame, or the multi-selection it belongs to).
 *  Both the row for the moved items themselves and their descendants
 *  are marked disabled.
 *
 *  The root row's id is the literal `"@root"` sentinel; the caller
 *  resolves it to `doc.root.id` at dispatch time so the picker doesn't
 *  need to know agocraft's brand-typed ItemId. */
export function buildFrameTree(
  doc: AgocraftDocument,
  movedItemIds: Iterable<string>,
): ReadonlyArray<FrameTreeNode> {
  const blocked = new Set<string>();
  for (const id of movedItemIds) {
    for (const d of findDescendantSet(doc, id)) blocked.add(d);
  }
  const rows: FrameTreeNode[] = [];
  // Synthetic root entry — always selectable unless it's somehow the
  // moved item (impossible in practice; root can't be reparented).
  rows.push({
    id: "@root",
    label: "디자인 루트",
    depth: 0,
    disabled: false,
  });
  function walk(node: AgocraftItem, depth: number): void {
    for (const child of node.children) {
      const id = String(child.id);
      const label = labelFor(child);
      rows.push({
        id,
        label,
        depth,
        disabled: blocked.has(id),
      });
      if (child.children.length > 0) walk(child, depth + 1);
    }
  }
  walk(doc.root, 1);
  return rows;
}

function labelFor(item: AgocraftItem): string {
  // Prefer an explicit user-facing name if the host set one.
  const attrs = item.attrs as { name?: unknown; title?: unknown };
  if (typeof attrs.name === "string" && attrs.name.length > 0) return attrs.name;
  if (typeof attrs.title === "string" && attrs.title.length > 0) return attrs.title;
  // Fall back to "kind · short-id" so unnamed frames stay distinguishable.
  const shortId = String(item.id).slice(0, 8);
  return `${item.kind} · ${shortId}`;
}

/** Resolve the picker's `id` field to the document's actual root id when
 *  the user picks the synthetic root row. Pass-through for any other id. */
export function resolvePickerTargetId(
  doc: AgocraftDocument,
  pickerId: string,
): string {
  if (pickerId === "@root") return String(doc.root.id);
  return pickerId;
}
