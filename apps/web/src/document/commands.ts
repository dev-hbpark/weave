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

import type { Item as AgocraftItem } from "@agocraft/core";
import {
  type Command,
  type CommandContext,
  fail,
  itemId as makeItemId,
  ok,
  type Patch,
  unitId as makeUnitId,
} from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import { findItemDeep, toAgocraftItem } from "./agocraft-mirror.js";
import { createDefaultItem } from "./seed.js";
import type {
  CanvasAttrs,
  CanvasShape,
  DomainKind,
  InteractionBehavior,
  Item as WeaveItem,
  ItemFrame,
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
 *  (add / remove / reset). In-place commands no longer call into this. */
export interface WeaveCommandTargets {
  readonly addItem: (kind: DomainKind) => void;
  readonly removeItem: (itemId: string) => void;
  readonly updateItem: (itemId: string, patch: (it: WeaveItem) => WeaveItem) => void;
  readonly updateBehavior: (
    itemId: string,
    behaviorId: string,
    patch: (b: InteractionBehavior) => InteractionBehavior,
  ) => void;
  readonly updateShape: (
    itemId: string,
    shapeId: string,
    patch: Partial<CanvasShape>,
  ) => void;
  readonly removeShape: (itemId: string, shapeId: string) => void;
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
export interface UpdateShapeInput {
  readonly itemId: string;
  readonly shapeId: string;
  readonly patch: Partial<CanvasShape>;
}
export interface RemoveShapeInput {
  readonly itemId: string;
  readonly shapeId: string;
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
  ): { id: import("@agocraft/core").ItemId; children: ReadonlyArray<import("@agocraft/core").Item> } | undefined => {
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
        return fail("container-not-found", `weave.item.add: container ${input.containerId} not in doc`);
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
        return fail("container-not-found", `weave.item.remove: container ${input.containerId} not in doc`);
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

  const updateShape: Command<UpdateShapeInput, void> = {
    name: "weave.shape.update",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.shape.update: no item with id "${input.itemId}"`);
      }
      if (child.kind !== "canvas-design") {
        return fail("kind-mismatch", `weave.shape.update: item ${input.itemId} is not a canvas-design`);
      }
      const attrs = child.attrs as unknown as CanvasAttrs;
      const nextShapes = attrs.shapes.map((s) =>
        s.id === input.shapeId ? { ...s, ...input.patch } : s,
      );
      const nextAttrs = { ...attrs, shapes: nextShapes };
      // DR-017 ADR-D — same auto-merge story as `weave.item.update`.
      // Per-shape merge isolation would require an explicit merge
      // namespace on the patch; left for a follow-up iteration.
      const patch: Patch = {
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after: nextAttrs as unknown as Readonly<Record<string, unknown>>,
      };
      return ok(undefined, [patch]);
    },
  };

  const removeShape: Command<RemoveShapeInput, void> = {
    name: "weave.shape.remove",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.shape.remove: no item with id "${input.itemId}"`);
      }
      if (child.kind !== "canvas-design") {
        return fail("kind-mismatch", `weave.shape.remove: item ${input.itemId} is not a canvas-design`);
      }
      const attrs = child.attrs as unknown as CanvasAttrs;
      const nextShapes = attrs.shapes.filter((s) => s.id !== input.shapeId);
      const nextAttrs = { ...attrs, shapes: nextShapes };
      const patch: Patch = {
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after: nextAttrs as unknown as Readonly<Record<string, unknown>>,
      };
      return ok(undefined, [patch]);
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
        return fail("missing-behavior", `weave.behavior.update: unit ${input.behaviorId} carries no behavior payload`);
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

  return [
    addItem as Command,
    removeItem as Command,
    updateItem as Command,
    updateBehavior as Command,
    updateShape as Command,
    removeShape as Command,
    reset as Command,
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
): () => void {
  const commands = buildWeaveCommands(targets, pending);
  const registry = editor.container.resolve(CommandRegistryToken);
  const offs: Array<() => void> = [];
  for (const cmd of commands) {
    offs.push(registry.register(cmd));
  }
  return () => {
    for (const off of offs) off();
  };
}
