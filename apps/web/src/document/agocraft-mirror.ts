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
  applyPatch,
  addChild as coreAddChild,
  findDescendantSet as coreFindDescendantSet,
  findItemDeep as coreFindItemDeep,
  findParentAndIndex as coreFindParentAndIndex,
  findTrailDeep as coreFindTrailDeep,
  removeChild as coreRemoveChild,
  reorderRootChildren as coreReorderRootChildren,
  updateChild as coreUpdateChild,
  createSchema,
  itemId,
  STYLE_PROVIDER_UNIT_KIND,
  unitId,
} from "@agocraft/core";
import {
  type AbsoluteFrameTransform,
  absoluteFrameBoxFromTrail,
  absoluteFrameTransformFromTrail,
  computeReparentFrameRatio as coreComputeReparentFrameRatio,
  type FrameRect,
} from "@agocraft/spatial";
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

// ── WI-013 Phase 4b / WI-024 Phase 2b — Change → Document reducer ─────────
//
// `@agocraft/core`'s `applyPatch` is the single owner of the forward reducer —
// every Patch variant's apply semantics live in the library, not here. weave
// only re-applies its doc-level `updatedAt` bump via `opts.now` (`applyPatch`
// is clock-free by design — S1 R2 policy). Item / unit creation and removal
// flow through the self-contained `item.create` / `unit.create` / `item.remove`
// / `unit.remove` variants (WI-024 / DR-026), so no `PendingCreations`
// side-channel is needed: command → patches → TransactionRunner → ChangeStream
// → `applyChangeToDocument` → `setAgoDoc(next)`.

import type { Change as AgocraftChange } from "@agocraft/core";

export function applyChangeToDocument(
  doc: AgocraftDocument,
  change: AgocraftChange,
): AgocraftDocument {
  return applyPatch(doc, change, { now: nowIso() });
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

/** WI-022 / DR-025 S1 — the `@agocraft/core` tree helpers are clock-free (R2):
 *  they perform pure structural transforms and never stamp a timestamp. weave
 *  re-applies its doc-level `updatedAt` bump here so persistence sinks still
 *  see a fresh timestamp on every structural mutation, exactly as the previous
 *  host-local `withRoot` did. (Per-item `updatedAt` is intentionally not bumped
 *  — it is read only at migrate / load time, never during a live edit.)
 *  Returns the SAME reference on a no-op so the host's re-render skip holds. */
function bumpDocUpdatedAt(prev: AgocraftDocument, next: AgocraftDocument): AgocraftDocument {
  if (next === prev) return prev;
  return { ...next, meta: { ...next.meta, updatedAt: nowIso() } };
}

/** Append `child` to the container's children. Defaults to the document
 *  root; pass `containerId` to insert into a sub-doc at any depth. No-op
 *  if `containerId` doesn't resolve. */
export function addChild(
  doc: AgocraftDocument,
  child: AgocraftItem,
  containerId?: string,
): AgocraftDocument {
  // WI-022 S1 shim — delegate the structural append to @agocraft/core; brand
  // the host string id and re-apply the doc-level timestamp (see bumpDocUpdatedAt).
  const next = coreAddChild(
    doc,
    child,
    containerId === undefined ? undefined : itemId(containerId),
  );
  return bumpDocUpdatedAt(doc, next);
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
  // WI-022 S1 shim — @agocraft/core owns the reorder algorithm (out-of-stack
  // items keep their order at the end; SAME ref when the order is unchanged).
  const next = coreReorderRootChildren(doc, orderedAsc.map(itemId));
  return bumpDocUpdatedAt(doc, next);
}

/** Remove the child whose id matches `childId`, searched anywhere in the
 *  tree. Returns `doc` unchanged if no match. */
export function removeChild(doc: AgocraftDocument, childId: string): AgocraftDocument {
  // WI-022 S1 shim — @agocraft/core drops the subtree by id anywhere in the
  // tree (never the root); SAME ref when nothing was removed.
  const next = coreRemoveChild(doc, itemId(childId));
  return bumpDocUpdatedAt(doc, next);
}

/** Patch the child whose id matches `childId`, searched anywhere in the
 *  tree. Returns `doc` unchanged if no match. */
export function updateChild(
  doc: AgocraftDocument,
  childId: string,
  patch: (item: AgocraftItem) => AgocraftItem,
): AgocraftDocument {
  // WI-022 S1 shim — @agocraft/core walks to the node and applies `patch`;
  // SAME ref when no node matched.
  const next = coreUpdateChild(doc, itemId(childId), patch);
  return bumpDocUpdatedAt(doc, next);
}

/** Find an Item anywhere in the tree (root, root.children, grandchildren, …).
 *  Returns undefined if not found. */
export function findItemDeep(doc: AgocraftDocument, id: string): AgocraftItem | undefined {
  // WI-022 S1 shim — delegate to @agocraft/core (brand the host string id).
  return coreFindItemDeep(doc, itemId(id));
}

/** Return the chain of Items from a direct child of `root` down to the
 *  target id (inclusive). Empty when target is the root itself. Undefined
 *  when no path exists. */
export function findTrailDeep(
  doc: AgocraftDocument,
  id: string,
): ReadonlyArray<AgocraftItem> | undefined {
  // WI-022 S1 shim — @agocraft/core owns the tree walk (root-direct-child →
  // target inclusive; `[]` for the root; `undefined` when no path exists).
  return coreFindTrailDeep(doc, itemId(id));
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
  id: string,
):
  | {
      readonly parent: AgocraftItem;
      readonly indexInParent: number;
    }
  | undefined {
  // WI-022 S1 shim — @agocraft/core resolves the direct parent + index
  // (undefined for the root or a missing id).
  return coreFindParentAndIndex(doc, itemId(id));
}

// ── Rotation-aware frame geometry (WI-022 / DR-025 S1 — R1 decomposition) ──
//
// The coordinate math now lives in @agocraft/spatial (project-neutral, fed a
// FrameRect chain). This file keeps the ONE thing that math can't know: that
// weave stores a frame at `item.attrs.frame`. `frameTrail` is that single
// extraction point — it walks the tree via the (now library-backed) shim and
// pulls each ancestor's frame into a `FrameRect[]`. The three exported
// functions are thin adapters: extract → delegate to spatial.

/** Extract the FrameRect chain for `id` (root-direct-child → target, inclusive).
 *  The only place that reads weave's `attrs.frame` shape. Returns:
 *    • `[]` when `id` is the document root (spatial treats it as the full box),
 *    • `null` when `id` is missing OR any ancestor lacks a `frame`. */
function frameTrail(doc: AgocraftDocument, id: string): FrameRect[] | null {
  const trail = findTrailDeep(doc, id);
  if (trail === undefined) return null;
  const frames: FrameRect[] = [];
  for (const item of trail) {
    const frame = (item.attrs as { frame?: FrameRect }).frame;
    if (!frame) return null;
    frames.push(frame);
  }
  return frames;
}

/** Absolute axis-aligned bbox of an item in design-space pixels (rotation
 *  ignored — v1 hit-test is axis-aligned). `null` when the item is missing or
 *  any ancestor lacks a `frame`. The document root maps to
 *  `(0, 0, designW, designH)`. */
export function absoluteFrameBox(
  doc: AgocraftDocument,
  id: string,
  designW: number,
  designH: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null {
  const frames = frameTrail(doc, id);
  if (frames === null) return null;
  return absoluteFrameBoxFromTrail(frames, designW, designH);
}

/** Rotation-aware absolute transform of a frame. `null` when the item is
 *  missing or an ancestor lacks a `frame`; the root maps to the full
 *  `designW × designH` box, identity matrix. */
export function absoluteFrameTransform(
  doc: AgocraftDocument,
  id: string,
  designW: number,
  designH: number,
): AbsoluteFrameTransform | null {
  const frames = frameTrail(doc, id);
  if (frames === null) return null;
  return absoluteFrameTransformFromTrail(frames, designW, designH);
}

/** Compute an item's new `frame` (ratio of `newParentId`) so the item — and
 *  its whole child subtree — keeps the same ON-SCREEN center, rotation, and
 *  size after a reparent. Rotation-aware end to end (see @agocraft/spatial's
 *  `computeReparentFrameRatio`). Returns null when either item is missing /
 *  lacks a frame, or the new parent has zero area. */
export function computeReparentFrameRatio(
  doc: AgocraftDocument,
  id: string,
  newParentId: string,
  designW: number,
  designH: number,
): { x: number; y: number; width: number; height: number; rotation: number } | null {
  const itemFrames = frameTrail(doc, id);
  const parentFrames = frameTrail(doc, newParentId);
  if (itemFrames === null || parentFrames === null) return null;
  return coreComputeReparentFrameRatio(itemFrames, parentFrames, designW, designH);
}

/** WI-039 — collect every descendant id of `itemId` (inclusive of the
 *  item itself). Used by `weave.item.reparent` to decide whether a
 *  candidate `newParentId` would form a cycle: if the candidate is the
 *  item or any of its descendants, the reparent is rejected. Also used
 *  by the three reparent surfaces (modifier drag, ThumbnailPanel drop,
 *  ContextMenu picker) to compute the disabled-target set up front. */
export function findDescendantSet(doc: AgocraftDocument, id: string): ReadonlySet<string> {
  // WI-022 S1 shim — @agocraft/core collects the inclusive descendant id set.
  // Rebuild as a Set<string> so host callers keep their plain-string `.has(...)`
  // contract (the library returns a branded `ReadonlySet<ItemId>`).
  return new Set<string>(coreFindDescendantSet(doc, itemId(id)));
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
