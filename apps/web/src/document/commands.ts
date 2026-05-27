// WI-013 Phase 2 / 4b — weave doc mutations as `@agocraft/editor` Commands.
//
// Two flavors of command, by what produces the state change:
//
//   1. **Patch-emitting (Phase 4b)** — `weave.item.update`, `weave.shape.update`,
//      `weave.shape.remove`, `weave.behavior.update`. These read the current
//      doc via `ctx.document`, compute real `Patch[]` describing the change,
//      and **do not** touch the host setter directly. The TransactionRunner
//      emits Changes, and `useDocument`'s ChangeStream subscriber applies
//      them to state via `applyChangeToDocument`. History sees real patches.
//
//   2. **Direct (Phase 2 + 4)** — `weave.item.add`, `weave.item.remove`,
//      `weave.doc.reset`. These call the host setter directly because the
//      Patch model can't carry a brand-new Item (no `item.create` patch
//      type). They still emit a summary `item.children` Patch for
//      observability — History.undo() of an add can't restore the original
//      Item until a side-channel ships the full Item with the Patch (Phase 5).
//
// Callbacks signature (`WeaveCommandTargets`) stays the same so the host
// (`useWeaveEditor`) can register both flavors uniformly.

import type { Item as AgocraftItem, Unit as AgocraftUnit, SerializedItem } from "@agocraft/core";
import {
  type Command,
  type CommandContext,
  fail,
  IdGeneratorToken,
  itemId as makeItemId,
  unitId as makeUnitId,
  ok,
  type Patch,
  remapIds,
  serializeItemSubtree,
  ref as styleRef,
} from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import {
  absoluteFrameBox,
  findDescendantSet,
  findItemDeep,
  findParentAndIndex,
  toAgocraftItem,
} from "./agocraft-mirror.js";
import { serializedItemToAgocraft } from "./clipboard/clipboard-converter.js";
import { clipboardStore } from "./clipboard/clipboard-store.js";
import {
  countSubtreeNodes,
  type ItemsClipboardPayload,
  MAX_PASTE_NODES,
  type PasteMode,
  SESSION_ORIGIN,
  STYLE_ATTRIBUTE_KEYS,
} from "./clipboard/clipboard-types.js";
import { type PasteCoordInput, resolvePasteFrame } from "./clipboard/paste-coord.js";
import { defaultPresetRegistry } from "./presets/default-registry.js";
import type { PresetRegistry } from "./presets/types.js";
import { createDefaultItem } from "./seed.js";
import { parseVarRef } from "./style/theme-tokens.js";
import type { DomainKind, InteractionBehavior, ItemFrame, Item as WeaveItem } from "./types.js";

/** Side-channel — per-editor map of Item shapes referenced by `item.children`
 *  Patches. Used in two directions:
 *
 *  - **forward** (`weave.item.add`): stage the brand-new Item; the reducer
 *    pulls its shape on the `item.children` added Patch to insert into the doc.
 *  - **inverse** (`weave.item.remove`): stage the to-be-removed Item before
 *    the Patch fires, so undo (which inverts the Patch into `added: [id]`)
 *    can put the Item back without losing its attrs / units / children.
 *
 *  Stored entries are NEVER deleted — they persist across undo / redo so
 *  history replay finds the right shape. Memory grows with total add/remove
 *  ops in the session; bounded by history capacity in practice. */
export interface PendingCreations {
  readonly stage: (item: AgocraftItem) => void;
  /** Persistent lookup — does not delete on read. */
  readonly lookup: (itemId: string) => AgocraftItem | undefined;
}

export function createPendingCreations(): PendingCreations {
  const map = new Map<string, AgocraftItem>();
  return {
    stage(item) {
      map.set(String(item.id), item);
    },
    lookup(itemId) {
      return map.get(itemId);
    },
  };
}

/** Slice of useDocument's callback surface used by the *direct* commands
 *  (add / remove / reset). In-place commands no longer call into this.
 *
 *  WI-032 Phase 3b — `updateShape` / `removeShape` were removed alongside
 *  the legacy `canvas-design.attrs.shapes[]` data shape. Shape primitives
 *  are now first-class Items; their attrs flow through `updateItem`. */
export interface WeaveCommandTargets {
  readonly addItem: (kind: DomainKind) => void;
  readonly removeItem: (itemId: string) => void;
  readonly updateItem: (itemId: string, patch: (it: WeaveItem) => WeaveItem) => void;
  readonly updateBehavior: (
    itemId: string,
    behaviorId: string,
    patch: (b: InteractionBehavior) => InteractionBehavior,
  ) => void;
  readonly reset: () => void;
}

export interface AddItemInput {
  readonly kind: DomainKind;
  /** Container's Item id — defaults to the document root. Pass a sub-doc id
   *  to add into a nested doc. */
  readonly containerId?: string;
  /** Override the seeded `frame` (0..1 ratio of the container). Phase 10b-2 —
   *  Toolbar's Add menu uses this to drop new items at the design's center
   *  (Figma-style) or at a pointer-drop location for drag-add. Defaults to
   *  the seed default (`FULL_FRAME`). */
  readonly frame?: ItemFrame;
  /** WI-020 — partial attrs to merge over the seeded defaults at creation
   *  time. Lets the host inject (a) image / video src URL, (b) shape sub-kind
   *  + subAttrs without a follow-up update (which would race the staging
   *  pipeline since the new item is only in `PendingCreations` until the
   *  next React tick). */
  readonly attrsOverride?: Readonly<Record<string, unknown>>;
}
export interface RemoveItemInput {
  readonly itemId: string;
  /** Where the removed item lives — same default + override rules as add. */
  readonly containerId?: string;
}
export interface UpdateItemInput {
  readonly itemId: string;
  readonly patch: (it: WeaveItem) => WeaveItem;
}
export interface UpdateBehaviorInput {
  readonly itemId: string;
  readonly behaviorId: string;
  readonly patch: (b: InteractionBehavior) => InteractionBehavior;
}

/** WI-030 — `weave.preset.insertSlide` input. */
export interface InsertPresetSlideInput {
  /** Preset id from the registry (e.g. `"cover.bold"`). */
  readonly presetId: string;
  /** Container Item id — defaults to the document root. */
  readonly containerId?: string;
  /** UI locale used to resolve the preset's `LocalizedText` strings into
   *  the seeded child Items. Defaults to `"ko"`. */
  readonly locale?: "ko" | "en";
}

/** Find any Item in the tree (root.children, grandchildren, …). Phase 10a
 *  swapped the original direct lookup to a deep walk so commands like
 *  weave.item.update / weave.shape.update can target items inside sub-docs at
 *  any depth, not only the top level. */
function findChild(doc: CommandContext["document"], itemId: string) {
  return findItemDeep(doc, itemId);
}

export function buildWeaveCommands(
  targets: WeaveCommandTargets,
  pending?: PendingCreations,
  presetRegistry: PresetRegistry = defaultPresetRegistry(),
): ReadonlyArray<Command> {
  // ── lifecycle commands (Phase 5/9/10a) — event-sourced via PendingCreations ──
  //
  // `containerId` lets the command target a nested container (a sub-doc Item)
  // instead of the root. Phase 10a switched to a recursive deep walk so the
  // container can be at any depth — drilling into sub-doc-of-sub-doc-of-…
  // is bounded only by the tree itself. The reducer (`applyChangeToDocument`)
  // uses the same deep walk to find the matching node and apply the
  // add/remove there.
  const findContainer = (
    doc: CommandContext["document"],
    containerId: string | undefined,
  ):
    | {
        id: import("@agocraft/core").ItemId;
        children: ReadonlyArray<import("@agocraft/core").Item>;
      }
    | undefined => {
    const rootId = String(doc.root.id);
    if (containerId === undefined || containerId === rootId) {
      return { id: doc.root.id, children: doc.root.children };
    }
    const sub = findItemDeep(doc, containerId);
    if (sub === undefined) return undefined;
    return { id: sub.id, children: sub.children };
  };

  const addItem: Command<AddItemInput, string> = {
    name: "weave.item.add",
    run: (ctx: CommandContext, input: AddItemInput) => {
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.item.add: container ${input.containerId} not in doc`,
        );
      }
      // Compute next camera-target order by scanning current units in scope.
      let maxOrder = -1;
      for (const child of container.children) {
        for (const u of child.units) {
          if (u.kind === "camera-target") {
            const behavior = u.attrs.behavior as { order?: number } | undefined;
            if (behavior?.order !== undefined && behavior.order > maxOrder) {
              maxOrder = behavior.order;
            }
          }
        }
      }
      let weaveItem = createDefaultItem(input.kind, maxOrder + 1);
      if (input.frame !== undefined) {
        weaveItem = {
          ...weaveItem,
          attrs: { ...weaveItem.attrs, frame: input.frame } as typeof weaveItem.attrs,
        };
      }
      if (input.attrsOverride !== undefined) {
        weaveItem = {
          ...weaveItem,
          attrs: { ...weaveItem.attrs, ...input.attrsOverride } as typeof weaveItem.attrs,
        };
      }
      const ts = new Date().toISOString();
      const agoItem = toAgocraftItem(weaveItem, ts);
      if (pending !== undefined) {
        pending.stage(agoItem);
      } else {
        targets.addItem(input.kind);
        return ok(String(agoItem.id), []);
      }
      const patches: Patch[] = [
        {
          type: "item.children",
          itemId: container.id,
          added: [agoItem.id],
          removed: [],
        },
      ];
      return ok(String(agoItem.id), patches);
    },
  };
  const removeItem: Command<RemoveItemInput, void> = {
    name: "weave.item.remove",
    run: (ctx: CommandContext, input: RemoveItemInput) => {
      // The `containerId` input is treated as a hint only — the command
      // derives the *actual* parent of `input.itemId` so a caller that
      // doesn't (or can't) re-derive the parent per call (e.g. a multi-
      // delete loop, a hover-action slot that only knows the item id)
      // still emits a correct structural patch.
      //
      // Without this derivation, a nested item's removal would emit a
      // patch against the root (the default containerId) → the
      // reducer's `mapItemDeep(root.id, ...)` walk lands on the root
      // and tries to remove `itemId` from `root.children`, which is a
      // no-op because the item lives deeper. The bug surfaced as "only
      // items at the design root delete; children don't" — fixed here
      // at the command boundary so every caller benefits.
      const found = findParentAndIndex(ctx.document, input.itemId);
      if (found === undefined) {
        return fail(
          "item-not-found",
          `weave.item.remove: itemId ${input.itemId} not in doc`,
        );
      }
      const parent = found.parent;
      if (pending !== undefined) {
        const target = parent.children[found.indexInParent];
        if (target !== undefined) {
          pending.stage(target);
        }
      } else {
        targets.removeItem(input.itemId);
      }
      const removed = makeItemId(input.itemId);
      const patches: Patch[] = [
        {
          type: "item.children",
          itemId: parent.id,
          added: [],
          removed: [removed],
        },
      ];
      return ok(undefined, patches);
    },
  };
  const reset: Command<void, void> = {
    name: "weave.doc.reset",
    run: () => {
      targets.reset();
      return ok(undefined, []);
    },
  };

  // ── patch-emitting commands (Phase 4b) ──
  //
  // None of these call into `targets.X`. The ChangeStream subscriber inside
  // `useDocument` is the SOLE state mutator for these mutations.

  const updateItem: Command<UpdateItemInput, void> = {
    name: "weave.item.update",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.item.update: no item with id "${input.itemId}"`);
      }
      // Project to weave shape so the caller's patcher works against the
      // expected type, then compute the attrs diff.
      const weaveItem: WeaveItem = {
        id: String(child.id),
        kind: child.kind as DomainKind,
        attrs: child.attrs as unknown as WeaveItem["attrs"],
        behaviors: [],
        createdAt: child.meta.createdAt,
      };
      const after = input.patch(weaveItem).attrs as unknown as Readonly<Record<string, unknown>>;
      // DR-017 ADR-D — drag auto-merge.
      //   agocraft's `mergeKeyOf` derives the merge key from the patch's
      //   target identity (e.g. `item.attrs#${itemId}`) and the editor's
      //   `historyMergeWindowMs: 500` already folds consecutive same-
      //   target patches into one undo step. A 60Hz drag on the same
      //   item.attrs (frame box, shape geometry) therefore collapses to
      //   a single entry without any per-patch hint here.
      //   Future enhancement (session-scoped scope so that two drags
      //   500ms apart on the same target remain separate undo steps)
      //   would extend agocraft's Patch type with an explicit merge
      //   namespace; out of scope for this iteration.
      const patch: Patch = {
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after,
      };
      return ok(undefined, [patch]);
    },
  };

  // WI-032 Phase 3 — `weave.shape.update` / `weave.shape.remove` previously
  // edited entries in `canvas-design.attrs.shapes[]`. With the legacy
  // canvas-design kind removed, individual shapes are first-class `shape`
  // primitive Items; their attrs flow through `weave.item.update` instead.

  // WI-036 follow-up — multi-selection corner-drag resize. A single
  // batch command emits N patches in one Change so the editor's
  // history records the entire gesture as ONE undoable step (instead
  // of N individual weave.item.update entries, which require N Cmd+Z
  // presses to fully undo). Input carries the resolved frame for each
  // item; the command computes the before/after patch for each.
  const resizeMultiInput = (input: {
    readonly updates: ReadonlyArray<{
      readonly itemId: string;
      readonly frame: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
    }>;
  }) => input;
  type ResizeMultiInput = ReturnType<typeof resizeMultiInput>;

  const resizeMulti: Command<ResizeMultiInput, void> = {
    name: "weave.items.resizeMulti",
    run: (ctx, input) => {
      const patches: Patch[] = [];
      for (const u of input.updates) {
        const child = findChild(ctx.document, u.itemId);
        if (child === undefined) continue;
        const prevAttrs = child.attrs as Readonly<Record<string, unknown>>;
        const prevFrame = (prevAttrs.frame ?? {}) as Readonly<Record<string, unknown>>;
        const nextAttrs: Readonly<Record<string, unknown>> = {
          ...prevAttrs,
          frame: { ...prevFrame, ...u.frame },
        };
        patches.push({
          type: "item.attrs",
          itemId: child.id,
          before: child.attrs,
          after: nextAttrs,
        });
      }
      return ok(undefined, patches);
    },
  };

  const updateBehavior: Command<UpdateBehaviorInput, void> = {
    name: "weave.behavior.update",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.behavior.update: no item with id "${input.itemId}"`);
      }
      const unit = child.units.find((u) => String(u.id) === input.behaviorId);
      if (unit === undefined) {
        return fail(
          "unit-not-found",
          `weave.behavior.update: no unit ${input.behaviorId} on ${input.itemId}`,
        );
      }
      const before = unit.attrs.behavior as InteractionBehavior | undefined;
      if (before === undefined) {
        return fail(
          "missing-behavior",
          `weave.behavior.update: unit ${input.behaviorId} carries no behavior payload`,
        );
      }
      const after = input.patch(before);
      const patch: Patch = {
        type: "unit.attrs",
        itemId: child.id,
        unitId: makeUnitId(input.behaviorId),
        unitKind: unit.kind,
        path: ["behavior"],
        before,
        after,
      };
      return ok(undefined, [patch]);
    },
  };

  // ─── WI-029 — design-level commands via HANDOFF-007 patch variants ────
  //
  // These produce real Patches (`document.attrs` / `item.children.reorder`)
  // so Cmd+Z works on design-level mutations. The host's `applyChange`
  // reducer applies the patch to `design.document.attrs` and child-order.
  //
  // Migration note: the legacy wrapper-level fields (`design.background`,
  // `design.presentationOrder`) are scheduled to be folded into
  // `document.attrs` in a follow-up PR; until then `use-design.ts` also
  // mirrors these mutations to the wrapper for backward-compat readers.

  const setBackground: Command<{ readonly color: string | null }, void> = {
    name: "weave.design.setBackground",
    run: (ctx, input) => {
      const before = (ctx.document.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const after: Record<string, unknown> = { ...before };
      if (input.color === null) {
        delete after.background;
      } else {
        // WI-040 — when the input is a `var(--*)` literal pointing at a
        // theme token registered in this project, store as a `StyleRef`
        // (`{$ref: tokenName}`) instead of the raw CSS string. The
        // StyleResolver cascade then walks ancestor providers on read,
        // letting per-slide / per-frame `style.provider` Units override
        // the same token. Non-token strings (custom hex / rgb / arbitrary
        // var) fall through and are stored verbatim.
        const tokenInfo = parseVarRef(input.color);
        after.background = tokenInfo !== null ? styleRef(tokenInfo.tokenName) : input.color;
      }
      return ok(undefined, [{ type: "document.attrs", before, after }]);
    },
  };

  const setPresentationOrder: Command<{ readonly order: ReadonlyArray<string> }, void> = {
    name: "weave.design.setPresentationOrder",
    run: (ctx, input) => {
      const before = (ctx.document.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const after: Record<string, unknown> = {
        ...before,
        presentationOrder: [...input.order],
      };
      return ok(undefined, [{ type: "document.attrs", before, after }]);
    },
  };

  // ─── WI-029 R2 — behavior commands via item.units patch ─────────────
  //
  // addBehavior: stage the full item (with the new Unit appended) into
  // PendingCreations; emit `item.units` patch with `added: [unitId]`.
  // The reducer's `item.units` case (extended in WI-029 R2) looks up the
  // staged item by itemId, finds the newly-added unit, and appends.
  //
  // removeBehavior: stage the current item (with the to-be-removed Unit
  // still present) so undo's inverse `added: [unitId]` can restore the
  // Unit body. Emit `item.units` patch with `removed: [unitId]`.

  const addBehavior: Command<
    { readonly itemId: string; readonly behavior: InteractionBehavior },
    string
  > = {
    name: "weave.item.addBehavior",
    run: (ctx, input) => {
      const item = findItemDeep(ctx.document, input.itemId);
      if (item === undefined) {
        return fail("item-not-found", `weave.item.addBehavior: no item with id "${input.itemId}"`);
      }
      const ts = new Date().toISOString();
      const newUnit: AgocraftUnit = {
        id: makeUnitId(input.behavior.id),
        kind: input.behavior.kind,
        attrs: {
          behavior: input.behavior as unknown as Readonly<Record<string, unknown>>,
        },
        meta: { createdAt: ts, updatedAt: ts, schemaVersion: 1 } as AgocraftUnit["meta"],
      };
      if (pending !== undefined) {
        // Stage the full item with the new Unit appended — reducer's item.units
        // case looks it up by itemId and grafts the new unit into the live item.
        const stagedItem: AgocraftItem = {
          ...item,
          units: [...item.units, newUnit],
          meta: { ...item.meta, updatedAt: ts } as AgocraftItem["meta"],
        };
        pending.stage(stagedItem);
      }
      const patch: Patch = {
        type: "item.units",
        itemId: item.id,
        added: [newUnit.id],
        removed: [],
      };
      return ok(input.behavior.id, [patch]);
    },
  };

  const removeBehavior: Command<{ readonly itemId: string; readonly behaviorId: string }, void> = {
    name: "weave.item.removeBehavior",
    run: (ctx, input) => {
      const item = findItemDeep(ctx.document, input.itemId);
      if (item === undefined) {
        return fail(
          "item-not-found",
          `weave.item.removeBehavior: no item with id "${input.itemId}"`,
        );
      }
      const unitToRemove = item.units.find((u) => String(u.id) === input.behaviorId);
      if (unitToRemove === undefined) {
        return fail(
          "unit-not-found",
          `weave.item.removeBehavior: no unit ${input.behaviorId} on ${input.itemId}`,
        );
      }
      if (pending !== undefined) {
        // Stage the *current* item (with the to-be-removed Unit still present)
        // — undo's inverse `added: [unitId]` will look up here to restore.
        pending.stage(item);
      }
      const patch: Patch = {
        type: "item.units",
        itemId: item.id,
        added: [],
        removed: [unitToRemove.id],
      };
      return ok(undefined, [patch]);
    },
  };

  const reorderChildren: Command<
    { readonly containerId?: string; readonly order: ReadonlyArray<string> },
    void
  > = {
    name: "weave.design.reorderChildren",
    run: (ctx, input) => {
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.design.reorderChildren: container ${input.containerId} not in doc`,
        );
      }
      const before = container.children.map((c) => c.id);
      // Validate: `input.order` must be a permutation of current children
      const beforeSet = new Set(before.map(String));
      const afterSet = new Set(input.order);
      if (beforeSet.size !== afterSet.size || [...beforeSet].some((id) => !afterSet.has(id))) {
        return fail(
          "order-mismatch",
          `weave.design.reorderChildren: order ${JSON.stringify(input.order)} is not a permutation of current children`,
        );
      }
      const after = input.order.map((s) => {
        const found = before.find((id) => String(id) === s);
        if (found === undefined) {
          throw new Error(`unreachable: validated above`);
        }
        return found;
      });
      return ok(undefined, [
        {
          type: "item.children.reorder",
          itemId: container.id,
          before,
          after,
        },
      ]);
    },
  };

  // ─── WI-038 — Per-item z-order commands ───────────────────────────────
  //
  // After WI-032's frame-only paradigm the only z-order surface (Peek mode)
  // could only reorder root.children, but the real demo doc has a single
  // root frame whose primitives are nested one level down — so dragging
  // in the peek inspector did nothing user-visible. These four commands
  // emit a single `item.children.reorder` patch against the item's *direct
  // parent container*, so the same dispatch works whether the selected
  // item is a top-level frame or a primitive inside a frame.
  //
  // Z-stacking convention: paint order = doc order. `children[0]` is the
  // bottom, `children[N-1]` is the top. "Bring forward" = swap with the
  // sibling at index+1, "Send backward" = swap with index-1. "Bring to
  // front" / "Send to back" splice the item to the end / start.
  //
  // No-op (already at front/back, or one-element parent) returns ok with
  // an empty patch list so callers don't have to special-case the
  // boundary — the editor / history records nothing because nothing
  // changed.

  function zorderTargetIndex(
    length: number,
    indexInParent: number,
    direction: "forward" | "backward" | "front" | "back",
  ): number | null {
    if (length <= 1) return null;
    const lastIdx = length - 1;
    let targetIdx: number;
    if (direction === "forward") targetIdx = Math.min(lastIdx, indexInParent + 1);
    else if (direction === "backward") targetIdx = Math.max(0, indexInParent - 1);
    else if (direction === "front") targetIdx = lastIdx;
    else targetIdx = 0;
    if (targetIdx === indexInParent) return null;
    return targetIdx;
  }

  const makeZOrderCommand = (
    name: string,
    direction: "forward" | "backward" | "front" | "back",
  ): Command<{ readonly itemId: string }, void> => ({
    name,
    run: (ctx, input) => {
      const found = findParentAndIndex(ctx.document, input.itemId);
      if (found === undefined) {
        return fail(
          "item-not-found",
          `${name}: no item with id "${input.itemId}" (or it is the root)`,
        );
      }
      const { parent, indexInParent } = found;
      const targetIdx = zorderTargetIndex(parent.children.length, indexInParent, direction);
      if (targetIdx === null) return ok(undefined, []);
      const before = parent.children.map((c) => c.id);
      const after = [...before];
      const [moved] = after.splice(indexInParent, 1);
      if (moved === undefined) return ok(undefined, []);
      after.splice(targetIdx, 0, moved);
      return ok(undefined, [
        {
          type: "item.children.reorder",
          itemId: parent.id,
          before,
          after,
        },
      ]);
    },
  });

  const bringForward = makeZOrderCommand("weave.item.bringForward", "forward");
  const sendBackward = makeZOrderCommand("weave.item.sendBackward", "backward");
  const bringToFront = makeZOrderCommand("weave.item.bringToFront", "front");
  const sendToBack = makeZOrderCommand("weave.item.sendToBack", "back");

  // ─── WI-039 — Item / Frame reparent ─────────────────────────────────────
  //
  // Surface-driven (modifier drag, ThumbnailPanel drop, ContextMenu picker)
  // dispatch on this single command. Each call carries N entries
  // `{ itemId, newParentId }`; the command computes oldState + newFrameRatio
  // (visual position preserved across the move), runs the cycle guard, and
  // emits one `item.reparent` patch — one history entry that Cmd+Z reverts
  // atomically. See features/reparent/ENGINEERING_PLAN.md §3.1.
  //
  // Validation responsibility (HANDOFF-002 §3): agocraft's patch reducer
  // does NOT check cycle / dedupe / unknown — surface UI + this command
  // body are the two defensive tiers.
  type ReparentInput = {
    readonly entries: ReadonlyArray<{
      readonly itemId: string;
      readonly newParentId: string;
    }>;
  };
  type ReparentEntry = Extract<Patch, { type: "item.reparent" }>["entries"][number];

  const reparentItem: Command<ReparentInput, void> = {
    name: "weave.item.reparent",
    run: (ctx, input) => {
      const requested = input.entries;
      if (requested.length === 0) return ok(undefined, []); // no-op

      // Dedupe — same itemId twice = caller bug; keep last entry. agocraft
      // doesn't reject duplicates (Q1, HANDOFF-002 §4) so doing it here.
      const dedup = new Map<string, (typeof requested)[number]>();
      for (const e of requested) dedup.set(e.itemId, e);
      const uniqueEntries = [...dedup.values()];

      // Cycle guard — reject if newParentId is the item itself or any
      // of its descendants. 3-tier defense's middle tier (surface UI is
      // first, agocraft is intentionally absent).
      for (const e of uniqueEntries) {
        if (e.newParentId === e.itemId) {
          return fail(
            "reparent-cycle",
            `weave.item.reparent: newParentId "${e.newParentId}" equals itemId`,
          );
        }
        const descendants = findDescendantSet(ctx.document, e.itemId);
        if (descendants.has(e.newParentId)) {
          return fail(
            "reparent-cycle",
            `weave.item.reparent: newParentId "${e.newParentId}" is a descendant of "${e.itemId}"`,
          );
        }
      }

      // Compute oldState + newFrameRatio for every entry. design-size
      // is taken as 1×1 — the ratios cancel out so the result is in 0..1
      // of the new parent regardless of the surrounding design pixel size.
      const DESIGN_UNIT = 1;
      const patchEntries: ReparentEntry[] = [];
      for (const e of uniqueEntries) {
        const cur = findParentAndIndex(ctx.document, e.itemId);
        if (cur === undefined) continue; // unknown item — skip
        const item = findItemDeep(ctx.document, e.itemId);
        if (item === undefined) continue;
        const newParent = findItemDeep(ctx.document, e.newParentId);
        if (newParent === undefined) continue;

        const newParentAbsBox = absoluteFrameBox(
          ctx.document,
          e.newParentId,
          DESIGN_UNIT,
          DESIGN_UNIT,
        );
        const itemAbsBox = absoluteFrameBox(ctx.document, e.itemId, DESIGN_UNIT, DESIGN_UNIT);
        if (newParentAbsBox === null || itemAbsBox === null) continue;
        if (newParentAbsBox.w <= 0 || newParentAbsBox.h <= 0) continue;

        const newFrameRatio = {
          x: (itemAbsBox.x - newParentAbsBox.x) / newParentAbsBox.w,
          y: (itemAbsBox.y - newParentAbsBox.y) / newParentAbsBox.h,
          width: itemAbsBox.w / newParentAbsBox.w,
          height: itemAbsBox.h / newParentAbsBox.h,
        };

        // oldFrameRatio = the item's current attrs.frame (already old-parent-relative).
        const itemFrame = (item.attrs as { frame?: ReparentEntry["oldFrameRatio"] }).frame;
        if (itemFrame === undefined) continue;

        patchEntries.push({
          itemId: item.id,
          oldParentId: cur.parent.id,
          oldIndex: cur.indexInParent,
          oldFrameRatio: itemFrame,
          newParentId: newParent.id,
          newIndex: newParent.children.length, // v1 = append to end of new parent
          newFrameRatio,
        });
      }

      if (patchEntries.length === 0) return ok(undefined, []);
      return ok(undefined, [{ type: "item.reparent", entries: patchEntries }]);
    },
  };

  // WI-030 — Slide preset batch insert.
  //
  // The preset factory returns a fully populated slide AgocraftItem whose
  // `children` already carry the layout's text / shape items. We stage that
  // single Item via PendingCreations (FR-003 §F1: the reducer's
  // `item.children` case grafts the staged subtree wholesale), then emit ONE
  // `item.children` patch on the container. Result: one history entry,
  // `Cmd+Z` reverts the entire preset in one step.
  //
  // Falls back to a host-side mutation when `pending` is undefined — same
  // contract as `weave.item.add` for tests / non-event-sourced contexts.
  const insertPresetSlide: Command<InsertPresetSlideInput, string> = {
    name: "weave.preset.insertSlide",
    run: (ctx: CommandContext, input: InsertPresetSlideInput) => {
      const preset = presetRegistry.getPreset(input.presetId);
      if (preset === undefined) {
        return fail(
          "preset-not-found",
          `weave.preset.insertSlide: no preset with id "${input.presetId}"`,
        );
      }
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.preset.insertSlide: container ${input.containerId} not in doc`,
        );
      }

      const now = new Date().toISOString();
      // Same shape as seed.ts:nextId — `<prefix>-<base36-ts>-<base36-rand>` —
      // so preset-emitted ids visually match commands that build items via
      // `createDefaultItem`. Counter starts at 1 per preset insert so siblings
      // get monotonically increasing ids.
      let counter = 0;
      const newId = (prefix: string): string => {
        counter += 1;
        const ts = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 6);
        return `${prefix}-${ts}-${counter.toString(36)}${rand}`;
      };

      const slide = preset.factory({
        locale: input.locale ?? "ko",
        newId,
        now,
      });

      if (pending !== undefined) {
        pending.stage(slide);
      } else {
        // Host fallback — useDocument.addItem can't carry the pre-built
        // subtree, so degrade gracefully to a single empty frame. Tests
        // that need the full subtree should provide `pending`.
        targets.addItem("frame");
        return ok(String(slide.id), []);
      }

      const patches: Patch[] = [
        {
          type: "item.children",
          itemId: container.id,
          added: [slide.id],
          removed: [],
        },
      ];
      return ok(String(slide.id), patches);
    },
  };

  // ─── WI-041 Phase 3 — clipboard copy / cut / paste ──────────────────────
  //
  // copy / cut serialise the selected Item's subtree (with descendants)
  // into the in-memory clipboard store. `cut` additionally emits the
  // same `item.children { removed }` patch the existing `weave.item.remove`
  // command uses, so a single Cmd+Z restores the removed Item to its
  // original parent + position via the existing PendingCreations + reducer
  // path. paste reads the clipboard, re-issues all ItemIds via
  // `remapIds` (DR-019 D3), stages the new subtree with `pending`, then
  // emits a single `item.children { added }` patch on the target container
  // — the reducer's existing `case "item.children"` resolves the staged
  // shape, achieving DR-019 D2's "single transaction, single Cmd+Z"
  // contract WITHOUT needing the new `item.create` patch reducer wiring
  // here. The new patch variant remains useful for cross-tab paste in
  // Phase 4 where no PendingCreations side-channel is available.

  /** Currently-known build version. Stamped into the payload so cross-tab
   *  consumers in Phase 4 can drop payloads from incompatible builds. The
   *  schema version (`1`) is the gate; this is informational only. */
  const APP_VERSION = "weave.dev";
  // SESSION_ORIGIN is module-level (clipboard-types.ts) so the
  // BroadcastChannel transport can read the same constant — see
  // `mountBroadcastChannelTransport`.

  /** Persistent counter — bumped each time a paste lands. Reset to 0
   *  whenever a new payload is written (a fresh copy). The counter only
   *  needs single-session lifetime so a module-level closure suffices. */
  let pasteStackIndex = 0;

  interface ClipboardCopyInput {
    /** Items to copy. v1 takes the first id only — multi-select clipboard
     *  ships with WI-036's selection-set graduation. */
    readonly itemIds: ReadonlyArray<string>;
  }

  interface ClipboardCutInput extends ClipboardCopyInput {
    /** Parent container of every cut item — required for the `item.children`
     *  Patch. v1 takes the parent of the first id; multi-cut across
     *  multiple parents is WI-036's job. */
    readonly containerId?: string;
  }

  interface ClipboardPasteInput {
    /** Target container for the `everything` mode. Defaults to the
     *  document root. Ignored by Paste Special modes — those mutate
     *  `targetIds` in place. */
    readonly containerId?: string;
    /** Resolved pixel size of the destination container. Provided by the
     *  host (FrameStage knows the rendered frame box). Required for the
     *  D5 paste-coordinate resolver. */
    readonly containerSizePx: { readonly width: number; readonly height: number };
    /** Pointer's last frame-local pixel position when paste fires via a
     *  pointer-context (Cmd+V right after a hover, ContextMenu paste).
     *  `undefined` for keyboard-only paste — the resolver falls back to
     *  the source frame + offset. */
    readonly pointerInContainer?: PasteCoordInput["pointerInContainer"];
    /** Paste mode (DR-019 D6). Defaults to `"everything"` for plain
     *  Cmd+V. Cmd+Opt+V opens the Paste Special dialog which then
     *  invokes this command with one of the four "only" modes. */
    readonly mode?: PasteMode;
    /** Currently-selected target Item ids. Required by every Paste
     *  Special mode (style / text / size / position). v1 v iterates
     *  the list and emits one Patch per target so a single Cmd+Z
     *  reverts every recipient at once (history's automerge collapses
     *  same-transaction patches into one entry). */
    readonly targetIds?: ReadonlyArray<string>;
  }

  // ── Paste Special handlers — declarative registry (Rule 6) ──────────────
  //
  // Each handler walks the currently-selected targets and emits a list
  // of `item.attrs` patches projecting the relevant slice of the source
  // payload onto each. Modes that need no patch (no selection, no
  // applicable target) return an empty patch list and the command
  // returns `ok` — the user experience is "selected nothing useful, the
  // clipboard didn't move".
  type StyleHandler = (args: {
    readonly doc: CommandContext["document"];
    readonly sourceAttrs: Readonly<Record<string, unknown>>;
    readonly targetIds: ReadonlyArray<string>;
  }) => Patch[];

  const pickStyleAttrs = (source: Readonly<Record<string, unknown>>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of STYLE_ATTRIBUTE_KEYS) {
      if (k in source) out[k] = source[k];
    }
    return out;
  };

  const pasteStyleHandler: StyleHandler = ({ doc, sourceAttrs, targetIds }) => {
    const slice = pickStyleAttrs(sourceAttrs);
    if (Object.keys(slice).length === 0) return [];
    const patches: Patch[] = [];
    for (const id of targetIds) {
      const target = findItemDeep(doc, id);
      if (target === undefined) continue;
      patches.push({
        type: "item.attrs",
        itemId: target.id,
        before: target.attrs,
        after: { ...target.attrs, ...slice },
      });
    }
    return patches;
  };

  const pasteTextHandler: StyleHandler = ({ doc, sourceAttrs, targetIds }) => {
    // Text-only paste touches `text` + `textRuns`. Targets that are not
    // text-kind silently skip — the user might have a mixed selection.
    const sourceText = "text" in sourceAttrs ? sourceAttrs.text : undefined;
    const sourceRuns = "textRuns" in sourceAttrs ? sourceAttrs.textRuns : undefined;
    if (sourceText === undefined && sourceRuns === undefined) return [];
    const patches: Patch[] = [];
    for (const id of targetIds) {
      const target = findItemDeep(doc, id);
      if (target === undefined) continue;
      if (target.kind !== "text") continue;
      const next: Record<string, unknown> = { ...target.attrs };
      if (sourceText !== undefined) next.text = sourceText;
      if (sourceRuns !== undefined) next.textRuns = sourceRuns;
      patches.push({
        type: "item.attrs",
        itemId: target.id,
        before: target.attrs,
        after: next,
      });
    }
    return patches;
  };

  const pasteSizeHandler: StyleHandler = ({ doc, sourceAttrs, targetIds }) => {
    const sourceFrame = (sourceAttrs.frame ?? undefined) as
      | { width?: number; height?: number }
      | undefined;
    if (
      sourceFrame === undefined ||
      sourceFrame.width === undefined ||
      sourceFrame.height === undefined
    ) {
      return [];
    }
    const patches: Patch[] = [];
    for (const id of targetIds) {
      const target = findItemDeep(doc, id);
      if (target === undefined) continue;
      const targetFrame = (target.attrs as { frame?: ItemFrame }).frame;
      if (targetFrame === undefined) continue;
      const nextFrame: ItemFrame = {
        ...targetFrame,
        width: sourceFrame.width,
        height: sourceFrame.height,
      };
      patches.push({
        type: "item.attrs",
        itemId: target.id,
        before: target.attrs,
        after: { ...target.attrs, frame: nextFrame },
      });
    }
    return patches;
  };

  const pastePositionHandler: StyleHandler = ({ doc, sourceAttrs, targetIds }) => {
    const sourceFrame = (sourceAttrs.frame ?? undefined) as
      | { x?: number; y?: number }
      | undefined;
    if (
      sourceFrame === undefined ||
      sourceFrame.x === undefined ||
      sourceFrame.y === undefined
    ) {
      return [];
    }
    const patches: Patch[] = [];
    for (const id of targetIds) {
      const target = findItemDeep(doc, id);
      if (target === undefined) continue;
      const targetFrame = (target.attrs as { frame?: ItemFrame }).frame;
      if (targetFrame === undefined) continue;
      const nextFrame: ItemFrame = {
        ...targetFrame,
        x: sourceFrame.x,
        y: sourceFrame.y,
      };
      patches.push({
        type: "item.attrs",
        itemId: target.id,
        before: target.attrs,
        after: { ...target.attrs, frame: nextFrame },
      });
    }
    return patches;
  };

  const PASTE_SPECIAL_HANDLERS: Record<Exclude<PasteMode, "everything">, StyleHandler> = {
    style: pasteStyleHandler,
    text: pasteTextHandler,
    size: pasteSizeHandler,
    position: pastePositionHandler,
  };

  const clipboardCopy: Command<ClipboardCopyInput, void> = {
    name: "weave.clipboard.copy",
    run: (ctx: CommandContext, input: ClipboardCopyInput) => {
      const id = input.itemIds[0];
      if (id === undefined) return fail("nothing-selected", "No items selected to copy");
      const item = findItemDeep(ctx.document, id);
      if (item === undefined) {
        return fail("item-not-found", `weave.clipboard.copy: no item with id "${id}"`);
      }
      const parent = findParentAndIndex(ctx.document, id);
      const serialized: SerializedItem = serializeItemSubtree(item);
      // Phase 4 — MAX_PASTE_NODES gate. Refused copies leave the
      // existing clipboard untouched so users can still paste their
      // last successful copy. The host's hotkey / context-menu
      // dispatcher surfaces the `clipboard-too-large` code as a toast.
      const nodes = countSubtreeNodes(serialized);
      if (nodes > MAX_PASTE_NODES) {
        return fail(
          "clipboard-too-large",
          `weave.clipboard.copy: subtree has ${nodes} nodes, max ${MAX_PASTE_NODES}`,
          { nodes, max: MAX_PASTE_NODES },
        );
      }
      const payload: ItemsClipboardPayload = {
        schemaVersion: 1,
        appVersion: APP_VERSION,
        origin: SESSION_ORIGIN,
        timestamp: Date.now(),
        kind: "weave/items.v1",
        data: {
          item: serialized,
          relations: [],
          ...(parent !== undefined ? { sourceParentId: String(parent.parent.id) } : {}),
        },
      };
      clipboardStore.write(payload);
      pasteStackIndex = 0; // fresh payload — reset paste-stacking offset
      return ok(undefined, []);
    },
  };

  const clipboardCut: Command<ClipboardCutInput, void> = {
    name: "weave.clipboard.cut",
    run: (ctx: CommandContext, input: ClipboardCutInput) => {
      const id = input.itemIds[0];
      if (id === undefined) return fail("nothing-selected", "No items selected to cut");
      const item = findItemDeep(ctx.document, id);
      if (item === undefined) {
        return fail("item-not-found", `weave.clipboard.cut: no item with id "${id}"`);
      }
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.clipboard.cut: container ${input.containerId} not in doc`,
        );
      }
      const parent = findParentAndIndex(ctx.document, id);
      // First serialise to the clipboard — this is a side-effect of the
      // command, but happens before the removal patch so a paste right
      // afterwards (or in another tab on Phase 4) sees the snapshot.
      const serialized: SerializedItem = serializeItemSubtree(item);
      // Phase 4 — MAX_PASTE_NODES gate. A cut above the cap is refused
      // BEFORE the removal patch fires, so the source item stays in the
      // doc and the user can recover.
      const nodes = countSubtreeNodes(serialized);
      if (nodes > MAX_PASTE_NODES) {
        return fail(
          "clipboard-too-large",
          `weave.clipboard.cut: subtree has ${nodes} nodes, max ${MAX_PASTE_NODES}`,
          { nodes, max: MAX_PASTE_NODES },
        );
      }
      const payload: ItemsClipboardPayload = {
        schemaVersion: 1,
        appVersion: APP_VERSION,
        origin: SESSION_ORIGIN,
        timestamp: Date.now(),
        kind: "weave/items.v1",
        data: {
          item: serialized,
          relations: [],
          ...(parent !== undefined ? { sourceParentId: String(parent.parent.id) } : {}),
        },
      };
      clipboardStore.write(payload);
      pasteStackIndex = 0;
      // Now the structural removal — mirrors `weave.item.remove`. The
      // patch must target the *actual* parent of `id`, not the
      // (possibly hinted) `input.containerId`. The actual parent has
      // been resolved into `parent.parent.id` above. Falling back to
      // `container.id` would re-introduce the silent-no-op-for-nested-
      // items bug.
      if (pending !== undefined) {
        pending.stage(item); // so undo can restore the original Item shape
      } else {
        targets.removeItem(id);
      }
      const removalContainerId = parent !== undefined ? parent.parent.id : container.id;
      const patches: Patch[] = [
        {
          type: "item.children",
          itemId: removalContainerId,
          added: [],
          removed: [makeItemId(id)],
        },
      ];
      return ok(undefined, patches);
    },
  };

  const clipboardPaste: Command<ClipboardPasteInput, string> = {
    name: "weave.clipboard.paste",
    run: (ctx: CommandContext, input: ClipboardPasteInput) => {
      const payload = clipboardStore.read();
      if (payload === undefined) {
        return fail("clipboard-empty", "weave.clipboard.paste: clipboard is empty");
      }
      if (payload.kind !== "weave/items.v1") {
        return fail(
          "unsupported-kind",
          `weave.clipboard.paste: kind "${payload.kind}" not supported in v1`,
        );
      }

      // Paste Special — mode-aware dispatch through the registry. The
      // four "only" modes don't touch the document tree; they project a
      // slice of the source's attrs onto every currently-selected target.
      const mode: PasteMode = input.mode ?? "everything";
      if (mode !== "everything") {
        const handler = PASTE_SPECIAL_HANDLERS[mode];
        const targetIds = input.targetIds ?? [];
        if (targetIds.length === 0) {
          return fail(
            "no-targets",
            `weave.clipboard.paste(${mode}): no selected targets to apply to`,
          );
        }
        const patches = handler({
          doc: ctx.document,
          sourceAttrs: payload.data.item.attrs,
          targetIds,
        });
        // Empty patch list = source had no applicable slice or none of
        // the targets accept it (e.g., `text` mode on a non-text
        // selection). Return ok so the clipboard stays intact and the
        // host's Paste Special dialog closes cleanly.
        return ok("", patches);
      }

      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.clipboard.paste: container ${input.containerId} not in doc`,
        );
      }
      if (pending === undefined) {
        // The host MUST initialise the editor with a `PendingCreations`
        // side-channel (every production path does). Falling back to a
        // direct `targets.addItem` would lose the subtree shape, so we
        // refuse instead.
        return fail(
          "no-pending-channel",
          "weave.clipboard.paste: PendingCreations side-channel not configured",
        );
      }

      // 1) Re-issue every ItemId / UnitId in the subtree (DR-019 D3) —
      //    same-doc paste must never collide with the source.
      const idGen = ctx.resolve(IdGeneratorToken);
      pasteStackIndex += 1;
      const { subtree } = remapIds(payload.data.item, idGen, payload.data.relations);

      // 2) Compute the destination frame via the D5 resolver. The source
      //    frame is the only piece we read off the payload's attrs; the
      //    rest of the subtree is opaque to the host.
      const sourceFrame: ItemFrame = (payload.data.item.attrs as { frame?: ItemFrame }).frame ?? {
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
        rotation: 0,
      };
      const newFrame = resolvePasteFrame({
        sourceFrame,
        containerSizePx: input.containerSizePx,
        pasteIndex: pasteStackIndex,
        ...(input.pointerInContainer !== undefined
          ? { pointerInContainer: input.pointerInContainer }
          : {}),
      });

      // 3) Convert SerializedItem → AgocraftItem and overwrite the root
      //    frame. Children's frames are left untouched (they are
      //    parent-relative ratios — the visual layout survives the paste).
      const pastedRoot = serializedItemToAgocraft(subtree);
      const pastedWithFrame: AgocraftItem = {
        ...pastedRoot,
        attrs: { ...pastedRoot.attrs, frame: newFrame } as typeof pastedRoot.attrs,
      };

      // 4) Stage the subtree shape via PendingCreations and emit ONE
      //    `item.children { added }` patch. The reducer's existing case
      //    resolves the staged Item; Cmd+Z reverts the whole subtree.
      pending.stage(pastedWithFrame);
      const patches: Patch[] = [
        {
          type: "item.children",
          itemId: container.id,
          added: [pastedWithFrame.id],
          removed: [],
        },
      ];
      return ok(String(pastedWithFrame.id), patches);
    },
  };

  return [
    addItem as Command,
    removeItem as Command,
    updateItem as Command,
    resizeMulti as Command,
    updateBehavior as Command,
    reset as Command,
    setBackground as Command,
    setPresentationOrder as Command,
    reorderChildren as Command,
    bringForward as Command,
    sendBackward as Command,
    bringToFront as Command,
    sendToBack as Command,
    reparentItem as Command,
    addBehavior as Command,
    removeBehavior as Command,
    insertPresetSlide as Command,
    clipboardCopy as Command,
    clipboardCut as Command,
    clipboardPaste as Command,
  ];
}

/** Register the command set on an editor. Returns a single teardown that
 *  unregisters all commands. When `pending` is provided, `weave.item.add`
 *  becomes event-sourced (stages new Items in the side-channel; reducer
 *  pulls them on item.children-added). Without it, addItem falls back to
 *  direct mutation via `targets.addItem`. */
export function registerWeaveCommands(
  editor: Editor,
  targets: WeaveCommandTargets,
  pending?: PendingCreations,
  presetRegistry?: PresetRegistry,
): () => void {
  const commands = buildWeaveCommands(targets, pending, presetRegistry);
  const registry = editor.container.resolve(CommandRegistryToken);
  const offs: Array<() => void> = [];
  for (const cmd of commands) {
    offs.push(registry.register(cmd));
  }
  return () => {
    for (const off of offs) off();
  };
}
