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

import type { Item as AgocraftItem, Unit as AgocraftUnit } from "@agocraft/core";
import {
  type Command,
  type CommandContext,
  fail,
  itemId as makeItemId,
  unitId as makeUnitId,
  ok,
  type Patch,
} from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import { findItemDeep, toAgocraftItem } from "./agocraft-mirror.js";
import { defaultPresetRegistry } from "./presets/default-registry.js";
import type { PresetRegistry } from "./presets/types.js";
import { createDefaultItem } from "./seed.js";
import type {
  DomainKind,
  InteractionBehavior,
  ItemFrame,
  Item as WeaveItem,
} from "./types.js";

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
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.item.remove: container ${input.containerId} not in doc`,
        );
      }
      if (pending !== undefined) {
        const target = container.children.find((c) => String(c.id) === input.itemId);
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
          itemId: container.id,
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
      if (input.color === null) delete after.background;
      else after.background = input.color;
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

  return [
    addItem as Command,
    removeItem as Command,
    updateItem as Command,
    updateBehavior as Command,
    reset as Command,
    setBackground as Command,
    setPresentationOrder as Command,
    reorderChildren as Command,
    addBehavior as Command,
    removeBehavior as Command,
    insertPresetSlide as Command,
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
