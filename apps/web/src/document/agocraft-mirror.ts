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
  createSchema,
  type Document as AgocraftDocument,
  type Item as AgocraftItem,
  type ItemMeta as AgocraftItemMeta,
  type Unit as AgocraftUnit,
  type UnitMeta as AgocraftUnitMeta,
  itemId,
  unitId,
} from "@agocraft/core";
import type { Document as WeaveDocument, InteractionBehavior, Item as WeaveItem } from "./types.js";

const SCHEMA_VERSION = 3;

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
    units: [],
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
        { kind: "weave-doc", schemaVersion: SCHEMA_VERSION },
        { kind: "slide", schemaVersion: SCHEMA_VERSION },
        { kind: "canvas-design", schemaVersion: SCHEMA_VERSION },
        { kind: "block-doc", schemaVersion: SCHEMA_VERSION },
        { kind: "media", schemaVersion: SCHEMA_VERSION },
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
    case "item.units":
      // Not handled by the reducer in this phase — the direct-setter path
      // (addChild / removeChild) owns these. Returning `doc` makes the
      // reducer idempotent for these change types.
      return doc;
    default:
      return doc;
  }
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

function stripChildDeep(
  item: AgocraftItem,
  childId: string,
  onRemove: () => void,
): AgocraftItem {
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
export function findItemDeep(
  doc: AgocraftDocument,
  itemId: string,
): AgocraftItem | undefined {
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
        ? { ...u, attrs: { ...u.attrs, ...patch }, meta: { ...u.meta, updatedAt: nowIso() } as typeof u.meta }
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
  return (
    kind === "slide" ||
    kind === "canvas-design" ||
    kind === "block-doc" ||
    kind === "media"
  );
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
 *  PresentPage cast `docInAgocraft.root.children` entries to typed AgoItem. */
export function isDomainItem(item: AgocraftItem): boolean {
  const k = item.kind;
  return k === "slide" || k === "canvas-design" || k === "block-doc" || k === "media";
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
    (ago.root.attrs.title as string | undefined) ?? (ago.meta.userMeta?.title as string | undefined) ?? "";
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
