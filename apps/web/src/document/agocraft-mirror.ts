// WI-013 Phase 1 — weave Document ↔ `@agocraft/core` Document mirror.
//
// One-way for now: weave → agocraft. useDocument keeps the weave shape as the
// source of truth (state, edits, persistence); the mirror is rebuilt on every
// useDocument state change and handed to the `@agocraft/editor` instance via
// `getDocument`. The editor reads it (state machine's `activeDocument`); it
// does NOT write back — edits still flow through useDocument's callbacks.
//
// Mapping decisions (recorded in WI-013 § Model gap):
//   - weave Document.title     → meta.userMeta.title
//   - weave Document.items[]   → root.children[]  (root.kind = "weave-doc")
//   - weave Item.behaviors[]   → Item.units[]     (each behavior becomes a Unit
//                                                  with kind = behavior.kind)
//   - weave Item.createdAt     → Item.meta.createdAt
//
// Phase 2 will reverse the direction: edits go through `editor.exec` and the
// weave shape (if it survives) becomes a projection. Phase 3 removes it.

import {
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  type ItemMeta as AgocraftItemMeta,
  type Unit as AgocraftUnit,
  type UnitMeta as AgocraftUnitMeta,
  createSchema,
  itemId,
  STYLE_PROVIDER_UNIT_KIND,
  unitId,
} from "@agocraft/core";
import { buildThemeTokenMap } from "./style/theme-tokens.js";
import type { InteractionBehavior, Document as WeaveDocument, Item as WeaveItem } from "./types.js";

const SCHEMA_VERSION = 3;

/** Build the root-level `style.provider` Unit that publishes weave's theme
 *  tokens (color.accent, color.domain.*, color.text.*, …) to every Item in
 *  the document. The token values are CSS `var(--*)` strings so the active
 *  `[data-theme]` attribute on `<html>` does the per-theme resolution. */
function buildRootStyleProviderUnit(): AgocraftUnit {
  return {
    id: unitId("style-provider-root"),
    kind: STYLE_PROVIDER_UNIT_KIND,
    attrs: { tokens: buildThemeTokenMap() },
    meta: makeUnitMeta(),
  };
}

/** Ensure every document the host receives has a `style.provider` Unit on
 *  its root carrying the canonical theme tokens. Three entry points need
 *  this guarantee:
 *
 *    • `createBlankDesign` (fresh empty doc — see storage.ts)
 *    • `serializer.fromJSON` load path (existing saved docs predating WI-040)
 *    • Remote-replace via CRDT (`replaceDocument`)
 *
 *  Calling this on a doc that already has a root provider is a no-op (we
 *  preserve the existing tokens map so any user-customized token survives).
 *  Calling it on a doc whose root lacks the Unit returns a NEW Document
 *  with the Unit prepended; the rest of the tree is untouched. */
export function ensureRootStyleProvider(doc: AgocraftDocument): AgocraftDocument {
  const hasProvider = doc.root.units.some((u) => u.kind === STYLE_PROVIDER_UNIT_KIND);
  if (hasProvider) return doc;
  const provider = buildRootStyleProviderUnit();
  return {
    ...doc,
    root: {
      ...doc.root,
      units: [provider, ...doc.root.units],
    },
  };
}

function makeItemMeta(createdAt: string, updatedAt: string): AgocraftItemMeta {
  return {
    createdAt,
    updatedAt,
    schemaVersion: SCHEMA_VERSION,
  };
}

function makeUnitMeta(): AgocraftUnitMeta {
  return { schemaVersion: SCHEMA_VERSION };
}

/** Convert a weave InteractionBehavior into an `@agocraft/core` Unit. The Unit's
 *  kind preserves the behavior kind ("camera-target" / "hotspot" / …); the
 *  full behavior payload lives under `attrs` so consumers can downcast. */
function behaviorToUnit(behavior: InteractionBehavior): AgocraftUnit {
  // We carry the whole behavior object under attrs.behavior — explicit so
  // round-trippers know where to read.
  return {
    id: unitId(behavior.id),
    kind: behavior.kind,
    attrs: { behavior: behavior as unknown as Readonly<Record<string, unknown>> },
    meta: makeUnitMeta(),
  };
}

/** Convert a single weave Item into an agocraft Item. */
export function toAgocraftItem(item: WeaveItem, updatedAt: string): AgocraftItem {
  return {
    id: itemId(item.id),
    kind: item.kind,
    attrs: item.attrs as unknown as Readonly<Record<string, unknown>>,
    units: item.behaviors.map(behaviorToUnit),
    children: [],
    meta: makeItemMeta(item.createdAt, updatedAt),
  };
}

/** Convert a weave Document into an agocraft Document. The root Item is
 *  synthetic — kind "weave-doc", children = mapped weave items. */
export function toAgocraftDocument(doc: WeaveDocument): AgocraftDocument {
  const rootCreatedAt = doc.items[0]?.createdAt ?? doc.updatedAt;
  const root: AgocraftItem = {
    id: itemId(`${doc.id}-root`),
    kind: "weave-doc",
    attrs: { title: doc.title },
    // WI-040 — seed the root with a `style.provider` Unit carrying weave's
    // theme tokens. The StyleResolver walks ancestors looking for the
    // nearest provider, so anchoring it here makes the full theme palette
    // available to every descendant Item.
    units: [buildRootStyleProviderUnit()],
    children: doc.items.map((it) => toAgocraftItem(it, doc.updatedAt)),
    meta: makeItemMeta(rootCreatedAt, doc.updatedAt),
  };
  return {
    id: doc.id,
    schema: createSchema(),
    root,
    meta: {
      createdAt: rootCreatedAt,
      updatedAt: doc.updatedAt,
      schemaVersion: SCHEMA_VERSION,
      schemaRefs: [
        // WI-032 Phase 3 — single canvas container + primitives.
        { kind: "weave-doc", schemaVersion: SCHEMA_VERSION },
        { kind: "frame", schemaVersion: SCHEMA_VERSION },
      ],
      // weave doc.id is preserved via userMeta so the agocraft Serializer
      // round-trip keeps it — agocraft's DocumentMeta has no top-level `id`
      // field, and Document.id is reset on `fromJSON`.
      userMeta: { title: doc.title, weaveDocId: doc.id },
    },
  };
}

/** Extract a weave behavior back from an agocraft Unit. Returns undefined if
 *  the Unit's kind isn't a known behavior kind. */
export function unitToBehavior(unit: AgocraftUnit): InteractionBehavior | undefined {
  const carried = unit.attrs.behavior as InteractionBehavior | undefined;
  if (carried === undefined) return undefined;
  if (
    carried.kind !== "camera-target" &&
    carried.kind !== "hotspot" &&
    carried.kind !== "reveal-on-step" &&
    carried.kind !== "hover-effect" &&
    carried.kind !== "button-trigger" &&
    carried.kind !== "entrance-animation"
  ) {
    return undefined;
  }
  return carried;
}

// ── WI-013 Phase 4b — Change → Document reducer ──────────────────────────
//
// Applies a single emitted Change back to the AgocraftDocument state. Commands
// that produce real Patches (in-place attribute / unit edits) flow through
// this reducer: command → patches → TransactionRunner → ChangeStream →
// `applyChangeToDocument` → `setAgoDoc(next)`.
//
// What this round handles (the common in-place edits):
//   - `item.attrs` — replace child Item's attrs wholesale (before/after).
//   - `unit.attrs` — set `item.unit.attrs[path[0]] = after` (path-targeted).
//
// What it skips (kept on the direct-setter path for now):
//   - `item.children` — adding new items needs the full new Item, which the
//     Patch alone doesn't carry. addItem/removeItem still mutate state via
//     `addChild` / `removeChild` directly.
//   - `item.units` — same reasoning.
//
// Future Phase 5: extend the reducer to handle children/units adds via a
// side-channel that ships the new Item/Unit shape alongside the Patch.

import type { Change as AgocraftChange } from "@agocraft/core";

/** Optional side-channel — `weave.item.add` and `weave.item.remove` both
 *  stage the affected Item's full shape here. The reducer reads (without
 *  removing) on every `item.children` added Patch — including inverses
 *  emitted by `editor.history.undo()`. See `commands.ts` →
 *  `createPendingCreations`. */
export interface PendingCreationLookup {
  readonly lookup: (itemId: string) => AgocraftItem | undefined;
}

export function applyChangeToDocument(
  doc: AgocraftDocument,
  change: AgocraftChange,
  pending?: PendingCreationLookup,
): AgocraftDocument {
  switch (change.type) {
    case "item.attrs": {
      const targetId = String(change.itemId);
      const next = mapItemDeep(doc.root, targetId, (it) => ({
        ...it,
        attrs: change.after,
        meta: { ...it.meta, updatedAt: nowIso() },
      }));
      return next === doc.root ? doc : withRoot(doc, next);
    }
    case "unit.attrs": {
      const targetItemId = String(change.itemId);
      const targetUnitId = String(change.unitId);
      const pathKey = String(change.path[0] ?? "");
      if (pathKey === "") return doc;
      const next = mapItemDeep(doc.root, targetItemId, (it) => ({
        ...it,
        units: it.units.map((u) =>
          String(u.id) === targetUnitId
            ? {
                ...u,
                attrs: { ...u.attrs, [pathKey]: change.after },
                meta: { ...u.meta, updatedAt: nowIso() } as typeof u.meta,
              }
            : u,
        ),
        meta: { ...it.meta, updatedAt: nowIso() },
      }));
      return next === doc.root ? doc : withRoot(doc, next);
    }
    case "item.children": {
      // Phase 5/9/10a — add/remove children inside a container at ANY depth.
      // The container is identified by `change.itemId`. The walk descends the
      // tree to find the matching node and applies the add/remove there.
      // Added items' full shapes come from the side-channel (pending); without
      // it (no host wired), the Patch is observational only.
      const containerId = String(change.itemId);
      const removedIds = new Set(change.removed.map((id) => String(id)));
      const addedFresh: AgocraftItem[] = (() => {
        if (change.added.length === 0 || pending === undefined) return [];
        const out: AgocraftItem[] = [];
        for (const id of change.added) {
          const item = pending.lookup(String(id));
          if (item !== undefined) out.push(item);
        }
        return out;
      })();
      const applyToChildren = (children: ReadonlyArray<AgocraftItem>): AgocraftItem[] => {
        const filtered = children.filter((c) => !removedIds.has(String(c.id)));
        const existingIds = new Set(filtered.map((c) => String(c.id)));
        for (const fresh of addedFresh) {
          if (existingIds.has(String(fresh.id))) continue;
          filtered.push(fresh);
        }
        return filtered;
      };
      const next = mapItemDeep(doc.root, containerId, (container) => ({
        ...container,
        children: applyToChildren(container.children),
        meta: { ...container.meta, updatedAt: nowIso() },
      }));
      return next === doc.root ? doc : withRoot(doc, next);
    }
    case "item.units": {
      // WI-029 R2 — apply unit add/remove through the patch path so
      // weave.item.addBehavior / removeBehavior become history-aware.
      // Same side-channel contract as `item.children`: the command stages
      // the *full Item* (with new units appended for add, or with the
      // to-be-removed unit still present for remove); the reducer reads
      // back the staged shape to graft the right Unit body.
      const targetItemId = String(change.itemId);
      const removedIds = new Set(change.removed.map((id) => String(id)));
      const addedUnits: ReadonlyArray<AgocraftUnit> = (() => {
        if (change.added.length === 0 || pending === undefined) return [];
        const stagedItem = pending.lookup(targetItemId);
        if (stagedItem === undefined) return [];
        const wantedIds = new Set(change.added.map((id) => String(id)));
        return stagedItem.units.filter((u) => wantedIds.has(String(u.id)));
      })();
      const next = mapItemDeep(doc.root, targetItemId, (item) => {
        const existingById = new Set(item.units.map((u) => String(u.id)));
        const filtered = item.units.filter((u) => !removedIds.has(String(u.id)));
        const nextUnits = [...filtered];
        for (const added of addedUnits) {
          if (existingById.has(String(added.id))) continue;
          nextUnits.push(added);
        }
        return {
          ...item,
          units: nextUnits,
          meta: { ...item.meta, updatedAt: nowIso() },
        };
      });
      return next === doc.root ? doc : withRoot(doc, next);
    }
    // ─── WI-029 / HANDOFF-007 — design-level patch variants ─────────────
    case "document.attrs": {
      // Replace the root document.attrs Record with `change.after`. Host's
      // wrapper-level mirrors (design.background / design.presentationOrder)
      // are kept in sync in `use-design.ts` (follow-up PR will fold those
      // wrapper fields into doc.attrs entirely).
      return { ...doc, attrs: change.after };
    }
    case "item.children.reorder": {
      // Reorder a container's children to match `change.after` (permutation
      // of `change.before`). The reducer trusts the patch was validated by
      // its emitter (commands.ts) and does a lookup+map.
      const containerId = String(change.itemId);
      const targetOrder = change.after.map(String);
      const next = mapItemDeep(doc.root, containerId, (container) => {
        const byId = new Map(container.children.map((c) => [String(c.id), c]));
        const reordered: AgocraftItem[] = [];
        for (const id of targetOrder) {
          const item = byId.get(id);
          if (item !== undefined) reordered.push(item);
        }
        // Preserve any children that weren't in the order (defensive — should
        // not happen for valid patches, but keeps reducer idempotent).
        if (reordered.length !== container.children.length) {
          for (const c of container.children) {
            if (!targetOrder.includes(String(c.id))) reordered.push(c);
          }
        }
        return {
          ...container,
          children: reordered,
          meta: { ...container.meta, updatedAt: nowIso() },
        };
      });
      return next === doc.root ? doc : withRoot(doc, next);
    }
    // ─── WI-039 — Item / Frame reparent ────────────────────────────────
    case "item.reparent": {
      // Each entry: detach the item from its current parent, splice into
      // newParent's children at newIndex, replace attrs.frame with
      // newFrameRatio. Entries are applied serially. The reducer trusts
      // its emitter (weave.item.reparent command) has cycle / dedupe
      // guarded — agocraft itself does not validate (HANDOFF-002 §3).
      let nextRoot = doc.root;
      for (const entry of change.entries) {
        const targetId = String(entry.itemId);
        const item = findItemInTree(nextRoot, targetId);
        if (item === undefined) continue;
        const itemWithNewFrame: AgocraftItem = {
          ...item,
          attrs: { ...item.attrs, frame: entry.newFrameRatio },
          meta: { ...item.meta, updatedAt: nowIso() },
        };
        const detached = removeItemFromTree(nextRoot, targetId);
        const inserted = insertItemIntoParent(
          detached,
          String(entry.newParentId),
          itemWithNewFrame,
          entry.newIndex,
        );
        if (inserted !== undefined) {
          nextRoot = inserted;
        }
      }
      return nextRoot === doc.root ? doc : withRoot(doc, nextRoot);
    }
    default:
      return doc;
  }
}

/** WI-039 — drop the subtree whose root has `targetId` from `root`'s
 *  descendants. Returns a new root if a removal happened, the same
 *  reference otherwise. */
function removeItemFromTree(root: AgocraftItem, targetId: string): AgocraftItem {
  if (root.children.length === 0) return root;
  let changed = false;
  const nextChildren: AgocraftItem[] = [];
  for (const c of root.children) {
    if (String(c.id) === targetId) {
      changed = true;
      continue;
    }
    const nc = removeItemFromTree(c, targetId);
    if (nc !== c) changed = true;
    nextChildren.push(nc);
  }
  if (!changed) return root;
  return { ...root, children: nextChildren, meta: { ...root.meta, updatedAt: nowIso() } };
}

/** WI-039 — splice `item` into `parentId`'s children at `index`. Returns
 *  the new root reference if the parent was found, `undefined`
 *  otherwise. Out-of-range indices clamp to `[0, children.length]`. */
function insertItemIntoParent(
  root: AgocraftItem,
  parentId: string,
  item: AgocraftItem,
  index: number,
): AgocraftItem | undefined {
  if (String(root.id) === parentId) {
    const insertAt = Math.max(0, Math.min(index, root.children.length));
    const next = [...root.children];
    next.splice(insertAt, 0, item);
    return { ...root, children: next, meta: { ...root.meta, updatedAt: nowIso() } };
  }
  if (root.children.length === 0) return undefined;
  let foundIn: number | null = null;
  const nextChildren = root.children.map((c, idx) => {
    if (foundIn !== null) return c;
    const nc = insertItemIntoParent(c, parentId, item, index);
    if (nc !== undefined) {
      foundIn = idx;
      return nc;
    }
    return c;
  });
  if (foundIn === null) return undefined;
  return { ...root, children: nextChildren, meta: { ...root.meta, updatedAt: nowIso() } };
}

/** Recursively walk an Item's subtree (including the item itself) and return
 *  a new tree where the item matching `targetId` has been transformed by
 *  `patch`. Returns the original reference if no match was found (cheap
 *  identity check for the caller to skip a no-op `withRoot`). */
function mapItemDeep(
  item: AgocraftItem,
  targetId: string,
  patch: (item: AgocraftItem) => AgocraftItem,
): AgocraftItem {
  if (String(item.id) === targetId) {
    return patch(item);
  }
  if (item.children.length === 0) return item;
  let changed = false;
  const nextChildren = item.children.map((c) => {
    const n = mapItemDeep(c, targetId, patch);
    if (n !== c) changed = true;
    return n;
  });
  if (!changed) return item;
  return { ...item, children: nextChildren };
}

// ── WI-013 Phase 4 — in-place mutations on agocraft Document ─────────────
//
// These helpers are pure (return new immutable copies). They are the canonical
// way to mutate the doc once useDocument's state becomes `AgocraftDocument`:
//   - `addChild`, `removeChild`, `updateChild` — root.children operations
//   - `updateAttrs` — Item.attrs replacement (used by attrs / shape updates)
//   - `updateUnitAttrs` — Unit.attrs replacement (used by behavior updates)
//
// The mutations bump `meta.updatedAt` so persistence sinks see fresh
// timestamps. They do NOT emit Change events — that's the editor.exec layer's
// job (Phase 4b will route mutations through commands that return Patches).

function nowIso(): string {
  return new Date().toISOString();
}

function withRoot(doc: AgocraftDocument, nextRoot: AgocraftItem): AgocraftDocument {
  const ts = nowIso();
  return {
    ...doc,
    root: nextRoot,
    meta: { ...doc.meta, updatedAt: ts },
  };
}

/** Append `child` to the container's children. Defaults to the document
 *  root; pass `containerId` to insert into a sub-doc at any depth. No-op
 *  if `containerId` doesn't resolve. */
export function addChild(
  doc: AgocraftDocument,
  child: AgocraftItem,
  containerId?: string,
): AgocraftDocument {
  const target = containerId ?? String(doc.root.id);
  const next = mapItemDeep(doc.root, target, (container) => ({
    ...container,
    children: [...container.children, child],
    meta: { ...container.meta, updatedAt: nowIso() },
  }));
  return next === doc.root ? doc : withRoot(doc, next);
}

/** Reorder root.children according to `orderedAsc` (z-ascending). Any child
 *  not mentioned in `orderedAsc` keeps its relative position at the end of
 *  the result, preserving global order continuity for items outside the
 *  local stack. Returns `doc` unchanged if the order is already a no-op.
 *  WI-019 Phase 3 — invoked by usePeekMode's onCommit. */
export function reorderRootChildren(
  doc: AgocraftDocument,
  orderedAsc: ReadonlyArray<string>,
): AgocraftDocument {
  const current = doc.root.children;
  if (orderedAsc.length === 0) return doc;
  const indexInOrder = new Map<string, number>();
  orderedAsc.forEach((id, i) => indexInOrder.set(id, i));

  // Items in the local stack reordered per orderedAsc; items outside stay
  // in their existing relative order, placed at the end (highest z).
  const inStack: AgocraftItem[] = [];
  const outOfStack: AgocraftItem[] = [];
  for (const child of current) {
    if (indexInOrder.has(String(child.id))) inStack.push(child);
    else outOfStack.push(child);
  }
  inStack.sort((a, b) => {
    const ai = indexInOrder.get(String(a.id)) ?? 0;
    const bi = indexInOrder.get(String(b.id)) ?? 0;
    return ai - bi;
  });
  const nextChildren = [...inStack, ...outOfStack];

  // Identical ordering — return doc as-is to avoid spurious re-render.
  let same = nextChildren.length === current.length;
  if (same) {
    for (let i = 0; i < current.length; i += 1) {
      if (current[i] !== nextChildren[i]) {
        same = false;
        break;
      }
    }
  }
  if (same) return doc;

  const nextRoot: AgocraftItem = {
    ...doc.root,
    children: nextChildren,
    meta: { ...doc.root.meta, updatedAt: nowIso() },
  };
  return withRoot(doc, nextRoot);
}

/** Remove the child whose id matches `childId`, searched anywhere in the
 *  tree. Returns `doc` unchanged if no match. */
export function removeChild(doc: AgocraftDocument, childId: string): AgocraftDocument {
  let removed = false;
  const next = stripChildDeep(doc.root, childId, () => {
    removed = true;
  });
  return removed ? withRoot(doc, next) : doc;
}

/** Patch the child whose id matches `childId`, searched anywhere in the
 *  tree. Returns `doc` unchanged if no match. */
export function updateChild(
  doc: AgocraftDocument,
  childId: string,
  patch: (item: AgocraftItem) => AgocraftItem,
): AgocraftDocument {
  const next = mapItemDeep(doc.root, childId, patch);
  return next === doc.root ? doc : withRoot(doc, next);
}

function stripChildDeep(item: AgocraftItem, childId: string, onRemove: () => void): AgocraftItem {
  const idx = item.children.findIndex((c) => String(c.id) === childId);
  if (idx >= 0) {
    onRemove();
    const nextChildren = item.children.slice();
    nextChildren.splice(idx, 1);
    return {
      ...item,
      children: nextChildren,
      meta: { ...item.meta, updatedAt: nowIso() },
    };
  }
  if (item.children.length === 0) return item;
  let changed = false;
  const nextChildren = item.children.map((c) => {
    const n = stripChildDeep(c, childId, onRemove);
    if (n !== c) changed = true;
    return n;
  });
  if (!changed) return item;
  return { ...item, children: nextChildren };
}

/** Find an Item anywhere in the tree (root, root.children, grandchildren, …).
 *  Returns undefined if not found. */
export function findItemDeep(doc: AgocraftDocument, itemId: string): AgocraftItem | undefined {
  return findItemInTree(doc.root, itemId);
}

function findItemInTree(item: AgocraftItem, itemId: string): AgocraftItem | undefined {
  if (String(item.id) === itemId) return item;
  for (const c of item.children) {
    const found = findItemInTree(c, itemId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Return the chain of Items from a direct child of `root` down to the
 *  target id (inclusive). Empty when target is the root itself. Undefined
 *  when no path exists. */
export function findTrailDeep(
  doc: AgocraftDocument,
  itemId: string,
): ReadonlyArray<AgocraftItem> | undefined {
  if (String(doc.root.id) === itemId) return [];
  const trail: AgocraftItem[] = [];
  function walk(item: AgocraftItem): boolean {
    for (const c of item.children) {
      trail.push(c);
      if (String(c.id) === itemId) return true;
      if (walk(c)) return true;
      trail.pop();
    }
    return false;
  }
  return walk(doc.root) ? trail : undefined;
}

/** Locate the direct parent container of `itemId` and the child index inside
 *  that parent. Returns:
 *   - `parent`: the document root or any nested Item that hosts `itemId` as a
 *     direct child;
 *   - `indexInParent`: the position of `itemId` inside `parent.children`.
 *
 *  Returns `undefined` when `itemId` doesn't exist in the tree or refers to
 *  the document root itself (no parent).
 *
 *  Used by the z-order commands (`weave.item.bringToFront` /
 *  `bringForward` / `sendBackward` / `sendToBack`) so the four siblings can
 *  reorder regardless of whether the selected item is a top-level Frame or a
 *  primitive nested inside one. */
export function findParentAndIndex(
  doc: AgocraftDocument,
  itemId: string,
):
  | {
      readonly parent: AgocraftItem;
      readonly indexInParent: number;
    }
  | undefined {
  const trail = findTrailDeep(doc, itemId);
  if (trail === undefined || trail.length === 0) return undefined;
  const parent = trail.length === 1 ? doc.root : trail[trail.length - 2]!;
  const indexInParent = parent.children.findIndex((c) => String(c.id) === itemId);
  if (indexInParent < 0) return undefined;
  return { parent, indexInParent };
}

/** WI-038 Phase 2 — compute the absolute axis-aligned bbox of an item in
 *  design-space pixels by walking from the root and composing each
 *  ancestor's `attrs.frame` (0..1 ratio of its parent). Rotation is
 *  intentionally ignored — composing a rotated chain into an axis-aligned
 *  box isn't meaningful, and weave's v1 hit-test treats every frame as
 *  axis-aligned.
 *
 *  Returns `null` when the item isn't in the tree or any intermediate
 *  ancestor lacks a `frame`. The document root maps to
 *  `(0, 0, designW, designH)` for symmetry with descendants. */
export function absoluteFrameBox(
  doc: AgocraftDocument,
  itemId: string,
  designW: number,
  designH: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null {
  if (String(doc.root.id) === itemId) {
    return { x: 0, y: 0, w: designW, h: designH };
  }
  const trail = findTrailDeep(doc, itemId);
  if (trail === undefined) return null;
  let box = { x: 0, y: 0, w: designW, h: designH };
  for (const item of trail) {
    const frame = (
      item.attrs as { frame?: { x: number; y: number; width: number; height: number } }
    ).frame;
    if (!frame) return null;
    box = {
      x: box.x + frame.x * box.w,
      y: box.y + frame.y * box.h,
      w: frame.width * box.w,
      h: frame.height * box.h,
    };
  }
  return box;
}

/** WI-039 — collect every descendant id of `itemId` (inclusive of the
 *  item itself). Used by `weave.item.reparent` to decide whether a
 *  candidate `newParentId` would form a cycle: if the candidate is the
 *  item or any of its descendants, the reparent is rejected. Also used
 *  by the three reparent surfaces (modifier drag, ThumbnailPanel drop,
 *  ContextMenu picker) to compute the disabled-target set up front. */
export function findDescendantSet(doc: AgocraftDocument, itemId: string): ReadonlySet<string> {
  const item = findItemDeep(doc, itemId);
  if (item === undefined) return new Set();
  const ids = new Set<string>();
  function walk(node: AgocraftItem): void {
    ids.add(String(node.id));
    for (const c of node.children) walk(c);
  }
  walk(item);
  return ids;
}

export function updateAttrs(
  item: AgocraftItem,
  patch: Readonly<Record<string, unknown>>,
): AgocraftItem {
  return {
    ...item,
    attrs: { ...item.attrs, ...patch },
    meta: { ...item.meta, updatedAt: nowIso() },
  };
}

export function updateUnitAttrs(
  item: AgocraftItem,
  unitId: string,
  patch: Readonly<Record<string, unknown>>,
): AgocraftItem {
  return {
    ...item,
    units: item.units.map((u) =>
      String(u.id) === unitId
        ? {
            ...u,
            attrs: { ...u.attrs, ...patch },
            meta: { ...u.meta, updatedAt: nowIso() } as typeof u.meta,
          }
        : u,
    ),
    meta: { ...item.meta, updatedAt: nowIso() },
  };
}

// ── WI-013 Phase 3 — inverse mirror (agocraft → weave) ───────────────────
//
// Used by `storage.loadDocument` to read a v4 (agocraft canonical) blob back
// into the weave in-memory shape, and by `import` flows that arrive as
// `@agocraft/core` Document via the editor's deserializer. Round-trip
// invariant: `fromAgocraftDocument(toAgocraftDocument(weave))` equals `weave`
// up to unknown-kind/unit warnings (which are dropped by this projection).

import type { DomainKind, ItemAttrsByKind } from "./types.js";

function isDomainKind(kind: string): kind is DomainKind {
  // WI-032 Phase 3 — single canvas container kind. Primitive kinds
  // (image / video / shape / text) are not weave-domain items in the
  // legacy sense — they're leaf primitives drawn inside frames.
  return kind === "frame";
}

/** Project an agocraft Item's units back to weave InteractionBehaviors.
 *  Used by `BehaviorEditor` / `BehaviorChips` so the renderer surface no
 *  longer reads a top-level `item.behaviors` field. Parameter typed
 *  structurally so both `AgocraftItem` and the type-narrowed `AgoItem<K>`
 *  view satisfy it. */
export function getBehaviors(item: {
  readonly units: ReadonlyArray<AgocraftUnit>;
}): ReadonlyArray<InteractionBehavior> {
  const out: InteractionBehavior[] = [];
  for (const u of item.units) {
    const b = unitToBehavior(u);
    if (b !== undefined) out.push(b);
  }
  return out;
}

/** Type narrower — `kind` is a known weave domain kind. Lets DemoDocPage /
 *  PresentPage cast `docInAgocraft.root.children` entries to typed AgoItem.
 *  WI-020 — image / video / shape are also accepted as domain items so they
 *  render in FrameStage and participate in selection / drill flows. */
export function isDomainItem(item: AgocraftItem): boolean {
  const k = item.kind;
  // WI-032 Phase 3 — frame (container) + 4 primitives (image / video /
  // shape / text). FrameStage filters root.children by this predicate to
  // skip the synthetic "weave-doc" root + any unknown kinds.
  return k === "frame" || k === "image" || k === "video" || k === "shape" || k === "text";
}

/** Project an agocraft Item back to a weave Item. Returns undefined when the
 *  Item's kind is not a known weave domain kind (e.g., the synthetic root
 *  Item with kind "weave-doc" — that's the document shell, not a domain item). */
export function fromAgocraftItem(item: AgocraftItem): WeaveItem | undefined {
  if (!isDomainKind(item.kind)) return undefined;
  const behaviors: InteractionBehavior[] = [];
  for (const u of item.units) {
    const b = unitToBehavior(u);
    if (b !== undefined) behaviors.push(b);
  }
  return {
    id: String(item.id),
    kind: item.kind,
    attrs: item.attrs as unknown as ItemAttrsByKind[typeof item.kind],
    behaviors,
    createdAt: item.meta.createdAt,
  } as WeaveItem;
}

/** Project an agocraft Document back to a weave Document. The agocraft root
 *  Item is unwrapped — only its `children` whose kind is a known weave domain
 *  become weave Items. */
export function fromAgocraftDocument(ago: AgocraftDocument): WeaveDocument {
  const items: WeaveItem[] = [];
  for (const child of ago.root.children) {
    const w = fromAgocraftItem(child);
    if (w !== undefined) items.push(w);
  }
  const title =
    (ago.root.attrs.title as string | undefined) ??
    (ago.meta.userMeta?.title as string | undefined) ??
    "";
  // Prefer the preserved weave id from userMeta — `ago.id` may be empty after
  // a Serializer round-trip since DocumentMeta has no top-level id field.
  const docId = (ago.meta.userMeta?.weaveDocId as string | undefined) ?? ago.id;
  return {
    id: docId,
    title,
    items,
    updatedAt: ago.meta.updatedAt,
    schemaVersion: 3,
  };
}
