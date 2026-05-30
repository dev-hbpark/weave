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

import type {
  Item as AgocraftItem,
  BuiltinItemFrame as AgocraftItemFrame,
  Unit as AgocraftUnit,
} from "@agocraft/core";
import {
  type ClipboardTransport,
  type Command,
  type CommandContext,
  createClipboardCommands,
  createDissolveFrameCommand,
  createDuplicateItemCommand,
  createDuplicateItemsCommand,
  createRemoveItemCommand,
  createRemoveItemsCommand,
  createReorderChildrenCommand,
  createReparentCommand,
  createSetDecorationCommand,
  createSetPolyPointsCommand,
  defaultShapeSubAttrs,
  FILL_UNIT_KIND,
  fail,
  SHAPE_SUB_KINDS,
  type ShapeSubKind,
  itemId as makeItemId,
  unitId as makeUnitId,
  moveAboveCommand,
  moveBelowCommand,
  moveToBottomCommand,
  moveToTopCommand,
  ok,
  type Patch,
  serializeItemSubtree,
  serializeUnitSubtree,
  ref as styleRef,
} from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import {
  createDropGridCellCommand,
  createSetFrameLayoutCommand,
  createSetItemLayoutChildCommand,
  createSwapFlexOrderCommand,
  createSwapGridCellsCommand,
} from "@agocraft/layout";
import {
  computeReparentFrameRatio,
  findItemDeep,
  findParentAndIndex,
  toAgocraftItem,
} from "./agocraft-mirror.js";
import { clipboardStore } from "./clipboard/clipboard-store.js";
import {
  type KnownClipboardPayload,
  MAX_PASTE_NODES,
  type PasteMode,
  SESSION_ORIGIN,
  STYLE_ATTRIBUTE_KEYS,
} from "./clipboard/clipboard-types.js";
import { type PasteCoordInput, resolvePasteFrame } from "./clipboard/paste-coord.js";
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "./layout/registry.js";
import {
  type AlignInput,
  type AlignOp,
  ALIGN_OPS_ORDER,
  computeAlignedFrames,
} from "./multi/align-ops.js";
import { defaultPresetRegistry } from "./presets/default-registry.js";
import type { PresetRegistry } from "./presets/types.js";
import { createDefaultItem } from "./seed.js";
import { parseVarRef } from "./style/theme-tokens.js";
import type { DomainKind, InteractionBehavior, ItemFrame, Item as WeaveItem } from "./types.js";

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
/** WI-050 — `weave.frame.removeKeepingChildren` input. Dissolves a frame:
 *  reparents its direct children to the root design, then removes the frame. */
export interface RemoveFrameKeepingChildrenInput {
  readonly frameId: string;
  /** Live design pixel size — only affects the result when a rotated ancestor
   *  sits in the chain under a non-square design; omit → unit square is exact
   *  otherwise. Same semantics as `weave.item.reparent`. */
  readonly designWidth?: number;
  readonly designHeight?: number;
}
export interface UpdateItemInput {
  readonly itemId: string;
  /** Imperative patcher (UI callers). Mutually exclusive with `attrs`. */
  readonly patch?: (it: WeaveItem) => WeaveItem;
  /** WI-054 — declarative, JSON-serializable alternative for the agent surface:
   *  shallow-merged over the item's current `attrs`. Provide COMPLETE sub-objects
   *  (e.g. the full `frame`) — a partial replaces the whole key. Exactly one of
   *  `patch` / `attrs` must be set. */
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/** WI-055 — rectangle corner radius. Targets `attrs.subAttrs.cornerRadii`
 *  (absolute px; the renderer caps at min(w,h)/2). Rectangle-only.
 *  Exactly one of `radius` (uniform — all four corners) / `radii` (per-corner
 *  partial — only the supplied corners change) must be set. */
export interface SetShapeCornerRadiusInput {
  readonly itemId: string;
  /** Uniform radius (px) applied to all four corners. 0 = square. */
  readonly radius?: number;
  /** Per-corner partial override (px). Omitted corners keep their current value. */
  readonly radii?: {
    readonly tl?: number;
    readonly tr?: number;
    readonly br?: number;
    readonly bl?: number;
  };
}

/** WI-056 — shape fill (`PaintSpec`). Replaces `attrs.fill` wholesale with the
 *  supplied paint: solid / linear-gradient / radial-gradient / none / image /
 *  video. Shape-only. The renderer (`ShapeBlock`) already materializes every
 *  variant via `paintToSvgFill`. */
export interface SetShapeFillInput {
  readonly itemId: string;
  readonly fill: import("@agocraft/core").PaintSpec;
}

/** WI-020 / WI-043 — explicit layout-spec mutation. Targets `attrs.layout`
 *  via the agocraft `item.layout` Patch variant (self-inverting before/after
 *  swap, mergeKeyOf folds rapid SegmentedControl flips into one undo). */
export interface SetFrameLayoutInput {
  readonly itemId: string;
  /** New `LayoutSpec`, or `undefined` to clear the policy. */
  readonly layout: import("@agocraft/core").LayoutSpec | undefined;
}

/** WI-020 / WI-043 — explicit child-policy mutation. Targets
 *  `attrs.layoutChild` via the agocraft `item.layoutChild` Patch variant. */
export interface SetItemLayoutChildInput {
  readonly itemId: string;
  /** New `LayoutChildPolicy`, or `undefined` to clear. */
  readonly policy: import("@agocraft/core").LayoutChildPolicy | undefined;
}

/** WI-043 — two layout siblings exchange positions (drag-to-swap UX):
 *  grid → cell swap, flex → sequence-order swap. */
export interface LayoutSiblingSwapInput {
  readonly aId: string;
  readonly bId: string;
}

/** WI-043 — drop a grid child at the cell under a point (ratio 0..1 within the
 *  parent frame): occupied cell → swap, empty cell → move there. */
export interface DropGridCellInput {
  readonly itemId: string;
  readonly x: number;
  readonly y: number;
}
export interface UpdateBehaviorInput {
  readonly itemId: string;
  readonly behaviorId: string;
  /** Imperative patcher (UI callers). Mutually exclusive with `behavior`. */
  readonly patch?: (b: InteractionBehavior) => InteractionBehavior;
  /** WI-054 — declarative, JSON-serializable alternative for the agent surface:
   *  shallow-merged over the current behavior payload. */
  readonly behavior?: Readonly<Record<string, unknown>>;
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

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** WI-062 — keep a shape item's `subAttrs` complete + self-consistent.
 *
 *  `weave.item.add` shallow-merges `attrsOverride` over the seeded attrs, so a
 *  PARTIAL `subAttrs` from a caller (e.g. the agent sending { shape:"rectangle" }
 *  with no `cornerRadii`) REPLACES the seed's complete one wholesale — and the
 *  renderer then dereferences the missing geometry (`cornerRadii.tl`) and throws,
 *  taking down the whole canvas. This makes the "geometry is optional; defaults
 *  are filled in" contract TRUE: rebuild `subAttrs` from `defaultShapeSubAttrs`
 *  for the resolved sub-kind and overlay the caller's provided fields on top
 *  (deep-merging plain-object geometry like `cornerRadii` so a partial `{ tl }`
 *  doesn't drop the other corners; extra/forward-compat fields are preserved).
 *  The sub-kind is taken from `subAttrs.shape` (authoritative), else the
 *  top-level `attrs.shape`, else "rectangle"; an unknown string falls back to
 *  "rectangle". `attrs.shape` is synced to match. Idempotent on complete input. */
function normalizeShapeAttrs(
  attrs: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const provided = isPlainObject(attrs.subAttrs) ? attrs.subAttrs : {};
  const candidate =
    typeof provided.shape === "string"
      ? provided.shape
      : typeof attrs.shape === "string"
        ? attrs.shape
        : "rectangle";
  const kind: ShapeSubKind = (SHAPE_SUB_KINDS as ReadonlyArray<string>).includes(candidate)
    ? (candidate as ShapeSubKind)
    : "rectangle";
  const defaults = defaultShapeSubAttrs(kind) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(provided)) {
    if (k === "shape") continue; // the resolved `kind` is authoritative
    const dv = defaults[k];
    merged[k] = isPlainObject(dv) && isPlainObject(v) ? { ...dv, ...v } : v;
  }
  merged.shape = kind;
  return { ...attrs, shape: kind, subAttrs: merged };
}

export function buildWeaveCommands(
  targets: WeaveCommandTargets,
  presetRegistry: PresetRegistry = defaultPresetRegistry(),
): ReadonlyArray<Command> {
  // ── lifecycle commands — self-contained item.create / item.remove patches ──
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
      // WI-062 — a shape's attrsOverride may carry a PARTIAL subAttrs that the
      // shallow merge above let replace the seed's complete one; normalize so the
      // geometry (e.g. rectangle cornerRadii) is never missing → no render crash.
      if (weaveItem.kind === "shape") {
        weaveItem = {
          ...weaveItem,
          attrs: normalizeShapeAttrs(
            weaveItem.attrs as unknown as Readonly<Record<string, unknown>>,
          ) as unknown as typeof weaveItem.attrs,
        };
      }
      const ts = new Date().toISOString();
      const agoItem = toAgocraftItem(weaveItem, ts);

      // WI-021 — layout-driven placement is owned by agocraft's LayoutEngine.
      // weave just hands it the parent + new child and emits whatever Patches
      // come back: the engine stages the new child at the layout's slot and
      // returns sibling-shift Patches (all in this transaction → single Cmd+Z).
      // For Absolute / no-layout parents the engine returns the child unchanged
      // and no sibling patches.
      const containerItem =
        input.containerId === undefined || input.containerId === String(ctx.document.root.id)
          ? ctx.document.root
          : findItemDeep(ctx.document, input.containerId);
      let stagedItem: AgocraftItem = agoItem;
      let layoutSiblingPatches: ReadonlyArray<Patch> = [];
      if (LAYOUT_FEATURE_ENABLED && containerItem !== undefined) {
        const result = getLayoutEngine().onChildAdd({ parent: containerItem, newChild: agoItem });
        stagedItem = result.stagedChild as AgocraftItem;
        layoutSiblingPatches = result.siblingPatches;
      }

      // WI-024 Phase 2b — emit self-contained `item.create` (carries the full
      // subtree); `applyPatch` materializes it and its inverse removes it. No
      // PendingCreations side-channel.
      const patches: Patch[] = [
        {
          type: "item.create",
          parentId: container.id,
          position: container.children.length,
          item: serializeItemSubtree(stagedItem),
        },
        ...layoutSiblingPatches,
      ];
      return ok(String(stagedItem.id), patches);
    },
  };
  // WI-025 (DR-025 S3) — generic remove absorbed into the @agocraft/core
  // editing-command kit. weave injects only the command NAME; the kit derives
  // the item's actual parent (so nested removals emit a correct structural
  // patch) and emits the self-contained `item.remove` (WI-024). Identical
  // behavior + error code (`item-not-found`) to the prior inline body.
  const removeItem = createRemoveItemCommand("weave.item.remove");
  // WI-025 (DR-025 S3) — batch remove absorbed into the editing-command kit.
  // Every selected item removed in ONE transaction so a single Cmd+Z restores
  // them all; each removal patch targets the item's OWN parent (resolved from
  // the pre-mutation doc) so items across different parents delete correctly.
  const removeItems = createRemoveItemsCommand("weave.items.remove");
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
      // WI-054 — `patch` (UI) or `attrs` (declarative, agent). The declarative
      // form shallow-merges the supplied attrs over the item's current attrs.
      if (input.patch === undefined && input.attrs === undefined) {
        return fail("invalid-input", "weave.item.update: provide `patch` or `attrs`");
      }
      const patchFn =
        input.patch ??
        ((it: WeaveItem): WeaveItem => ({
          ...it,
          attrs: {
            ...(it.attrs as unknown as Record<string, unknown>),
            ...(input.attrs ?? {}),
          } as unknown as WeaveItem["attrs"],
        }));
      const afterRaw = patchFn(weaveItem).attrs as unknown as Readonly<Record<string, unknown>>;
      // WI-062 — same shape-subAttrs completeness guard as weave.item.add: a
      // declarative `attrs` partial that touched subAttrs must not leave the
      // geometry incomplete (→ render crash). Idempotent for non-shape / complete.
      const after = child.kind === "shape" ? normalizeShapeAttrs(afterRaw) : afterRaw;
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

      // ── WI-021 — ANY frame change is reported to the LayoutEngine through a
      // SINGLE entry point. weave does NOT decide whether this is a parent
      // resize or a child resize — position management is delegated to the
      // relevant parent frame's layout. The engine inspects the document and
      // returns full-attrs reflow Patches (empty for absolute / no-layout).
      //
      // WI-047 — gate on an ACTUAL frame change. A non-frame edit (opacity,
      // fill, text, …) keeps the frame identical; running the relayout anyway
      // makes the engine emit full-attrs reflow patches computed from the
      // pre-update document, which get appended AFTER this patch and revert
      // the edit. Bug surfaced only inside flex/grid frames (absolute parents
      // return no reflow patches, so the overwrite was invisible there).
      const oldFrame = (child.attrs as { frame?: AgocraftItemFrame }).frame;
      const newFrame = (after as { frame?: AgocraftItemFrame }).frame;
      const frameChanged =
        oldFrame !== undefined &&
        newFrame !== undefined &&
        (oldFrame.x !== newFrame.x ||
          oldFrame.y !== newFrame.y ||
          oldFrame.width !== newFrame.width ||
          oldFrame.height !== newFrame.height ||
          oldFrame.rotation !== newFrame.rotation);
      const extraPatches: ReadonlyArray<Patch> =
        LAYOUT_FEATURE_ENABLED && frameChanged && oldFrame !== undefined && newFrame !== undefined
          ? getLayoutEngine().onFrameChanged({
              root: ctx.document.root,
              itemId: child.id,
              oldFrame,
              newFrame,
            })
          : [];
      if (extraPatches.length > 0) {
        return ok(undefined, [patch, ...extraPatches]);
      }
      return ok(undefined, [patch]);
    },
  };

  // WI-055 — rectangle corner radius. A thin, dedicated command over the
  // generic `weave.item.update`: it (a) guards that the target is a rectangle,
  // (b) rebuilds the COMPLETE `subAttrs` object (the `item.attrs` reducer
  // replaces the whole attrs map — a partial subAttrs would drop `shape`), and
  // (c) accepts either a uniform `radius` or a per-corner `radii` partial. The
  // renderer caps each radius at min(w,h)/2, so only a >= 0 floor is enforced.
  const setShapeCornerRadius: Command<SetShapeCornerRadiusInput, void> = {
    name: "weave.shape.setCornerRadius",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail(
          "item-not-found",
          `weave.shape.setCornerRadius: no item with id "${input.itemId}"`,
        );
      }
      const attrs = child.attrs as unknown as {
        readonly subAttrs?: {
          readonly shape?: string;
          readonly cornerRadii?: {
            readonly tl: number;
            readonly tr: number;
            readonly br: number;
            readonly bl: number;
          };
        };
      };
      const sub = attrs.subAttrs;
      if (sub === undefined || sub.shape !== "rectangle") {
        return fail(
          "not-a-rectangle",
          `weave.shape.setCornerRadius: item "${input.itemId}" is not a rectangle shape`,
        );
      }
      // Exactly one of `radius` / `radii`.
      const hasUniform = input.radius !== undefined;
      const hasPerCorner = input.radii !== undefined;
      if (hasUniform === hasPerCorner) {
        return fail(
          "invalid-input",
          "weave.shape.setCornerRadius: provide exactly one of `radius` or `radii`",
        );
      }
      const norm = (v: number | undefined, fallback: number): number =>
        v === undefined ? fallback : Number.isFinite(v) ? Math.max(0, v) : fallback;
      const cur = sub.cornerRadii ?? { tl: 0, tr: 0, br: 0, bl: 0 };
      const nextRadii = hasUniform
        ? (() => {
            const r = Math.max(0, input.radius as number);
            if (!Number.isFinite(r)) {
              return undefined;
            }
            return { tl: r, tr: r, br: r, bl: r };
          })()
        : {
            tl: norm(input.radii?.tl, cur.tl),
            tr: norm(input.radii?.tr, cur.tr),
            br: norm(input.radii?.br, cur.br),
            bl: norm(input.radii?.bl, cur.bl),
          };
      if (nextRadii === undefined) {
        return fail(
          "invalid-input",
          "weave.shape.setCornerRadius: `radius` must be a finite number",
        );
      }
      const after: Readonly<Record<string, unknown>> = {
        ...(child.attrs as unknown as Record<string, unknown>),
        subAttrs: { ...sub, shape: "rectangle", cornerRadii: nextRadii },
      };
      const patch: Patch = {
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after,
      };
      return ok(undefined, [patch]);
    },
  };

  // WI-056 → DR-028 — set a shape's fill (PaintSpec). Fill is now the
  // `decoration.fill` UNIT, not `attrs.fill`, so this command keeps its typed,
  // agent-discoverable surface but VALIDATES the paint then DELEGATES the patch
  // emission to the agocraft `createSetDecorationCommand` kit (kind = fill). One
  // source of truth for the unit.remove + unit.create patches.
  const SHAPE_FILL_TYPES = new Set([
    "none",
    "solid",
    "linear-gradient",
    "radial-gradient",
    "image",
    "video",
  ]);
  const fillDecorationCommand = createSetDecorationCommand("weave.shape.setFill");
  const setShapeFill: Command<SetShapeFillInput, void> = {
    name: "weave.shape.setFill",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.shape.setFill: no item with id "${input.itemId}"`);
      }
      if (child.kind !== "shape") {
        return fail("not-a-shape", `weave.shape.setFill: item "${input.itemId}" is not a shape`);
      }
      const fill = input.fill as { type?: unknown; stops?: unknown } | undefined;
      if (fill === undefined || typeof fill.type !== "string" || !SHAPE_FILL_TYPES.has(fill.type)) {
        return fail(
          "invalid-input",
          `weave.shape.setFill: \`fill.type\` must be one of ${[...SHAPE_FILL_TYPES].join(", ")}`,
        );
      }
      if (
        (fill.type === "linear-gradient" || fill.type === "radial-gradient") &&
        (!Array.isArray(fill.stops) || fill.stops.length < 2)
      ) {
        return fail(
          "invalid-input",
          "weave.shape.setFill: a gradient fill needs `stops` with at least 2 entries",
        );
      }
      // DR-028 — emit the decoration.fill unit patch via the kit command.
      return fillDecorationCommand.run(ctx, {
        itemId: input.itemId,
        kind: FILL_UNIT_KIND,
        attrs: input.fill as unknown as Readonly<Record<string, unknown>>,
      });
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

  // Shared: turn a list of resolved { itemId, frame } into the item.attrs +
  // LayoutEngine patches. Reused by `weave.items.resizeMulti` (frames supplied
  // by the caller) and `weave.items.align` (frames computed server-side from
  // the alignment op) so both land as ONE undoable Change with identical
  // layout-aware semantics.
  const frameUpdatesToPatches = (
    ctx: CommandContext,
    updates: ReadonlyArray<{
      readonly itemId: string;
      readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    }>,
  ): Patch[] => {
    const patches: Patch[] = [];
    for (const u of updates) {
      const child = findChild(ctx.document, u.itemId);
      if (child === undefined) continue;
      const prevAttrs = child.attrs as Readonly<Record<string, unknown>>;
      const prevFrameRaw = prevAttrs.frame as AgocraftItemFrame | undefined;
      const nextFrame = { ...(prevFrameRaw ?? {}), ...u.frame } as AgocraftItemFrame;
      const nextAttrs: Readonly<Record<string, unknown>> = {
        ...prevAttrs,
        frame: nextFrame,
      };
      patches.push({
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after: nextAttrs,
      });
      // WI-021 — same single LayoutEngine entry point as item.update: the
      // resize of ANY item (including a child inside a flex/grid frame) is
      // reported by frame change; the engine delegates position management
      // to the parent frame's layout. No host-side parent/child branching.
      if (LAYOUT_FEATURE_ENABLED && prevFrameRaw !== undefined) {
        patches.push(
          ...getLayoutEngine().onFrameChanged({
            root: ctx.document.root,
            itemId: child.id,
            oldFrame: prevFrameRaw,
            newFrame: nextFrame,
          }),
        );
      }
    }
    return patches;
  };

  const resizeMulti: Command<ResizeMultiInput, void> = {
    name: "weave.items.resizeMulti",
    run: (ctx, input) => ok(undefined, frameUpdatesToPatches(ctx, input.updates)),
  };

  // WI-059 — multi-selection align / distribute as an AGENT-reachable command.
  //
  // The selection-handle / toolbar / Alt+letter UI paths compute aligned frames
  // with the pure `computeAlignedFrames` registry and dispatch
  // `weave.items.resizeMulti` (see DesignPage `setMultiAligner`). The agent had
  // no declarative equivalent — it would have had to do the bounding-box math
  // itself and send raw frames. This command moves that math server-side: the
  // caller declares { itemIds, op } and the command resolves the frames, runs
  // the SAME pure helper, and emits the SAME resize patches as one undo step.
  //
  // Same-parent invariant mirrors the UI's `multiSameParent` gate: alignment is
  // only meaningful when every frame lives in one parent's 0..1 coordinate
  // space. Cross-parent selections are rejected (v1 contract) rather than
  // silently producing visually wrong results from mixed coordinate spaces.
  const alignItemsInput = (input: {
    readonly itemIds: ReadonlyArray<string>;
    readonly op: AlignOp;
  }) => input;
  type AlignItemsInput = ReturnType<typeof alignItemsInput>;

  const alignItems: Command<AlignItemsInput, void> = {
    name: "weave.items.align",
    run: (ctx, input) => {
      if (!ALIGN_OPS_ORDER.includes(input.op)) {
        return fail(
          "invalid-input",
          `weave.items.align: unknown op "${input.op}" (expected one of ${ALIGN_OPS_ORDER.join(", ")})`,
        );
      }
      const ids = input.itemIds ?? [];
      if (ids.length < 2) {
        return fail("invalid-input", "weave.items.align: need at least 2 itemIds");
      }
      const rootId = String(ctx.document.root.id);
      let parentId: string | undefined;
      const inputs: AlignInput[] = [];
      for (const id of ids) {
        const item = findChild(ctx.document, id);
        if (item === undefined) {
          return fail("item-not-found", `weave.items.align: no item with id "${id}"`);
        }
        const pi = findParentAndIndex(ctx.document, id);
        const pid = pi === undefined ? rootId : String(pi.parent.id);
        if (parentId === undefined) {
          parentId = pid;
        } else if (parentId !== pid) {
          return fail(
            "cross-parent-selection",
            "weave.items.align: all itemIds must share one parent frame (v1 aligns within a single coordinate space)",
          );
        }
        const f = (item.attrs as { frame?: ItemFrame }).frame;
        if (f === undefined) continue; // non-spatial item — nothing to align
        inputs.push({
          id,
          frame: { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation },
        });
      }
      if (inputs.length < 2) {
        return fail(
          "invalid-input",
          "weave.items.align: fewer than 2 of the itemIds have a frame to align",
        );
      }
      const out = computeAlignedFrames(inputs, input.op);
      // Emit only items whose frame actually moved — keeps history clean (no
      // zero-delta entries for already-aligned input). Same approx guard as the
      // UI dispatcher tolerates FP drift from the bbox-center math.
      const updates = out.flatMap((o, i) => {
        const prev = inputs[i]!.frame;
        const moved =
          Math.abs(prev.x - o.frame.x) > 1e-9 ||
          Math.abs(prev.y - o.frame.y) > 1e-9 ||
          Math.abs(prev.width - o.frame.width) > 1e-9 ||
          Math.abs(prev.height - o.frame.height) > 1e-9;
        return moved
          ? [
              {
                itemId: o.id,
                frame: {
                  x: o.frame.x,
                  y: o.frame.y,
                  width: o.frame.width,
                  height: o.frame.height,
                },
              },
            ]
          : [];
      });
      return ok(undefined, frameUpdatesToPatches(ctx, updates));
    },
  };

  // WI-061 — apply the SAME attrs change to many items as ONE undo entry. The
  // declarative, agent-facing mirror of the UI's multi-selection edit (toolbar
  // `updateAll` → `batchPerItem` → `editor.runBatch`): the user/agent selects N
  // items and changes a property once, and it reverts in a single Cmd+Z. Where
  // the UI groups N separate `weave.item.update` execs inside `runBatch`, this
  // command emits all the patches from ONE `run`, so the TransactionRunner gives
  // them one transaction id → the history records one entry (no runBatch needed
  // on the caller, which matters for the agent path where calls cross an async
  // network boundary and cannot be wrapped in a synchronous runBatch).
  //
  // `attrs` is shallow-merged over EACH item's current attrs — provide COMPLETE
  // sub-objects (e.g. a full `frame`), exactly like `weave.item.update`. Any
  // frame change is reported to the LayoutEngine per item (same single entry
  // point as the singular update / resizeMulti).
  const itemsUpdateInput = (input: {
    readonly itemIds: ReadonlyArray<string>;
    readonly attrs: Readonly<Record<string, unknown>>;
  }) => input;
  type ItemsUpdateInput = ReturnType<typeof itemsUpdateInput>;

  const itemsUpdate: Command<ItemsUpdateInput, void> = {
    name: "weave.items.update",
    run: (ctx, input) => {
      const ids = input.itemIds ?? [];
      if (ids.length === 0) {
        return fail("invalid-input", "weave.items.update: `itemIds` must be non-empty");
      }
      if (input.attrs === undefined) {
        return fail("invalid-input", "weave.items.update: `attrs` is required");
      }
      const patches: Patch[] = [];
      for (const id of ids) {
        const child = findChild(ctx.document, id);
        if (child === undefined) {
          return fail("item-not-found", `weave.items.update: no item with id "${id}"`);
        }
        const prevAttrs = child.attrs as Readonly<Record<string, unknown>>;
        // Shallow-merge over the item's current attrs (same contract as the
        // singular declarative weave.item.update).
        const after: Readonly<Record<string, unknown>> = { ...prevAttrs, ...input.attrs };
        patches.push({ type: "item.attrs", itemId: child.id, before: child.attrs, after });
        const oldFrame = (prevAttrs as { frame?: AgocraftItemFrame }).frame;
        const newFrame = (after as { frame?: AgocraftItemFrame }).frame;
        const frameChanged =
          oldFrame !== undefined &&
          newFrame !== undefined &&
          (oldFrame.x !== newFrame.x ||
            oldFrame.y !== newFrame.y ||
            oldFrame.width !== newFrame.width ||
            oldFrame.height !== newFrame.height ||
            oldFrame.rotation !== newFrame.rotation);
        if (
          LAYOUT_FEATURE_ENABLED &&
          frameChanged &&
          oldFrame !== undefined &&
          newFrame !== undefined
        ) {
          patches.push(
            ...getLayoutEngine().onFrameChanged({
              root: ctx.document.root,
              itemId: child.id,
              oldFrame,
              newFrame,
            }),
          );
        }
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
      // WI-054 — `patch` (UI) or `behavior` (declarative, agent: shallow-merge).
      if (input.patch === undefined && input.behavior === undefined) {
        return fail("invalid-input", "weave.behavior.update: provide `patch` or `behavior`");
      }
      const behaviorPatchFn =
        input.patch ??
        ((b: InteractionBehavior): InteractionBehavior =>
          ({ ...b, ...(input.behavior ?? {}) }) as InteractionBehavior);
      const after = behaviorPatchFn(before);
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
      // WI-024 Phase 2b — self-contained unit.create (carries the Unit body);
      // inverse = unit.remove → item.units removed. No PendingCreations.
      const patch: Patch = {
        type: "unit.create",
        itemId: item.id,
        position: item.units.length,
        unit: serializeUnitSubtree(newUnit),
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
      // WI-024 Phase 2b — self-contained unit.remove (carries the Unit so its
      // inverse, unit.create, restores it on undo). No PendingCreations.
      const position = item.units.findIndex((u) => String(u.id) === input.behaviorId);
      const patch: Patch = {
        type: "unit.remove",
        itemId: item.id,
        position,
        unit: serializeUnitSubtree(unitToRemove),
      };
      return ok(undefined, [patch]);
    },
  };

  // WI-025 (DR-025 S3) — child reorder absorbed into the editing-command kit.
  // Validates `order` is a permutation of the container's current children
  // (else `order-mismatch`) and emits one self-inverting `item.children.reorder`
  // patch. Resolves root or any nested container by id — same behavior + error
  // codes (`container-not-found` / `order-mismatch`) as the prior inline body.
  const reorderChildren = createReorderChildrenCommand("weave.design.reorderChildren");

  // ─── WI-038 / WI-022 S1 — Per-item z-order commands ───────────────────
  //
  // These four commands keep weave's names + hotkeys, but their bodies now
  // DELEGATE to the `agocraft.zOrder.*` library commands (DR-021), which
  // dispatch to the `ZOrderCapability` adapter (`design-frame.zorder.ts`).
  // The adapter builds the real `item.children.reorder` Patch by splicing the
  // item within its *direct parent container* (root for a top-level frame, the
  // containing frame for a nested primitive). The previous raw-splice
  // reimplementation here was the duplication DR-025 S1 removes.
  //
  // Z-stacking convention (unchanged): paint order = doc order. `children[0]`
  // is the bottom, `children[N-1]` the top. "Bring forward" = above the next
  // sibling (index+1); "Send backward" = below the previous (index-1); "Bring
  // to front" / "Send to back" = top / bottom of the parent stack. No-op (at
  // the boundary or a one-element parent) returns ok with an empty patch list.

  const bringToFront: Command<{ readonly itemId: string }, void> = {
    name: "weave.item.bringToFront",
    run: (ctx, input) => {
      // Guard keeps the `item-not-found` code uniform across all four commands
      // (the library command would otherwise return `invalid-unknown-item`).
      if (findParentAndIndex(ctx.document, input.itemId) === undefined) {
        return fail("item-not-found", `weave.item.bringToFront: no item "${input.itemId}"`);
      }
      return moveToTopCommand.run(ctx, { itemId: makeItemId(input.itemId) });
    },
  };
  const sendToBack: Command<{ readonly itemId: string }, void> = {
    name: "weave.item.sendToBack",
    run: (ctx, input) => {
      if (findParentAndIndex(ctx.document, input.itemId) === undefined) {
        return fail("item-not-found", `weave.item.sendToBack: no item "${input.itemId}"`);
      }
      return moveToBottomCommand.run(ctx, { itemId: makeItemId(input.itemId) });
    },
  };
  const bringForward: Command<{ readonly itemId: string }, void> = {
    name: "weave.item.bringForward",
    run: (ctx, input) => {
      // "One step forward" = above the immediate next sibling — weave's policy
      // for which sibling counts as one step; the splice itself is the adapter's.
      const found = findParentAndIndex(ctx.document, input.itemId);
      if (found === undefined) {
        return fail("item-not-found", `weave.item.bringForward: no item "${input.itemId}"`);
      }
      const { parent, indexInParent } = found;
      const targetIdx = Math.min(parent.children.length - 1, indexInParent + 1);
      if (targetIdx === indexInParent) return ok(undefined, []);
      const targetId = String(parent.children[targetIdx]?.id);
      return moveAboveCommand.run(ctx, {
        itemId: makeItemId(input.itemId),
        targetId: makeItemId(targetId),
      });
    },
  };
  const sendBackward: Command<{ readonly itemId: string }, void> = {
    name: "weave.item.sendBackward",
    run: (ctx, input) => {
      const found = findParentAndIndex(ctx.document, input.itemId);
      if (found === undefined) {
        return fail("item-not-found", `weave.item.sendBackward: no item "${input.itemId}"`);
      }
      const { parent, indexInParent } = found;
      const targetIdx = Math.max(0, indexInParent - 1);
      if (targetIdx === indexInParent) return ok(undefined, []);
      const targetId = String(parent.children[targetIdx]?.id);
      return moveBelowCommand.run(ctx, {
        itemId: makeItemId(input.itemId),
        targetId: makeItemId(targetId),
      });
    },
  };

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
  // WI-025 (DR-025 S3 increment 2) — reparent absorbed into the editing-command
  // kit. weave injects only the NAME + its geometry (`computeReparentFrameRatio`,
  // sourced from @agocraft/spatial) + the LayoutEngine reflow hook (gated on
  // LAYOUT_FEATURE_ENABLED). The kit owns dedupe + cycle guard (HANDOFF-002
  // middle tier) + the item.reparent assembly; same behavior + `reparent-cycle`
  // error code as the prior inline body.
  const reparentItem = createReparentCommand({
    name: "weave.item.reparent",
    computeFrameRatio: computeReparentFrameRatio,
    onReparentLayout: (args) => (LAYOUT_FEATURE_ENABLED ? getLayoutEngine().onReparent(args) : []),
  });

  // WI-057 — set freeform polygon vertices (agocraft kit command, registered
  // under weave's vocabulary). All item mutation goes through a command.
  const setPolyVertices = createSetPolyPointsCommand("weave.shape.setVertices");

  // ─── WI-050 — Delete a frame, keep its children ──────────────────────────
  //
  // "Dissolve" a frame: reparent every direct child up to the ROOT design
  // (preserving each child's on-screen position), then remove the now-empty
  // frame — all in ONE transaction so a single Cmd+Z restores the frame
  // with its children.
  //
  // Patch order is load-bearing: the `item.reparent` patch lands FIRST so the
  // reducer moves the children out (frame becomes empty), THEN the
  // `item.children` remove patch deletes the empty frame. History inverts a
  // transaction's patches in REVERSE order (editor `index.js`), so undo runs:
  //   1. remove⁻¹ → re-add the frame (we stage the EMPTY frame, NOT the
  //      original, so its children aren't resurrected here), then
  //   2. reparent⁻¹ → move the children from root back into the frame.
  // Staging the frame WITH its children would duplicate them on undo (they'd
  // come back via both the re-add AND the reparent inverse).
  // WI-025 (DR-025 S3 increment 2) — dissolve absorbed into the editing-command
  // kit. The kit owns the load-bearing compose invariant: item.reparent
  // (children→root) FIRST, then item.remove carrying the EMPTIED frame, so undo
  // (reverse order) re-adds the empty frame then re-homes the children without
  // duplication. weave injects only the NAME + geometry. Same `invalid-target`
  // / `item-not-found` error codes as the prior inline body.
  const removeFrameKeepingChildren = createDissolveFrameCommand({
    name: "weave.frame.removeKeepingChildren",
    computeFrameRatio: computeReparentFrameRatio,
  });

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

      // WI-024 Phase 2b — self-contained item.create carries the full preset
      // subtree; one history entry, Cmd+Z reverts the whole preset.
      const patches: Patch[] = [
        {
          type: "item.create",
          parentId: container.id,
          position: container.children.length,
          item: serializeItemSubtree(slide),
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
    const sourceFrame = (sourceAttrs.frame ?? undefined) as { x?: number; y?: number } | undefined;
    if (sourceFrame === undefined || sourceFrame.x === undefined || sourceFrame.y === undefined) {
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

  // WI-025 (DR-025 S3 increment 5) — copy / cut / paste("everything") absorbed
  // into the @agocraft/core clipboard kit. weave injects its host-specific bits:
  //   • transport  — the clipboardStore (adapted: kit payloads carry a `string`
  //                  kind + required `items`; weave's store uses a literal kind
  //                  + optional `items`, normalized here on read).
  //   • envelope   — payloadKind / appVersion / origin / clock.
  //   • resolvePasteFrame — weave's paste-coord policy (stacking + pointer).
  //   • pasteSpecial — the style/text/size/position handlers (host attr-
  //                  semantics) stay in weave and are dispatched by the kit.
  // The kit owns serialize+cap, the paste-stack counter, remapIds, and the
  // item.create / item.remove assembly. Same `weave.*` names + behavior.
  const clipboardTransport: ClipboardTransport = {
    write: (p) => clipboardStore.write(p as unknown as KnownClipboardPayload),
    read: () => {
      const p = clipboardStore.read();
      if (p === undefined) return undefined;
      // Normalize to the kit's required `items` (back-compat with payloads
      // written before the multi-item field).
      return { ...p, data: { ...p.data, items: p.data.items ?? [p.data.item] } };
    },
  };
  const {
    copy: clipboardCopy,
    cut: clipboardCut,
    paste: clipboardPaste,
  } = createClipboardCommands({
    names: {
      copy: "weave.clipboard.copy",
      cut: "weave.clipboard.cut",
      paste: "weave.clipboard.paste",
    },
    transport: clipboardTransport,
    payloadKind: "weave/items.v1",
    appVersion: APP_VERSION,
    origin: SESSION_ORIGIN,
    now: () => Date.now(),
    maxNodes: MAX_PASTE_NODES,
    resolvePasteFrame: (a) => {
      const base = {
        sourceFrame: a.sourceFrame as ItemFrame,
        containerSizePx: a.containerSizePx,
        pasteIndex: a.pasteIndex,
      };
      return a.pointerInContainer !== undefined
        ? resolvePasteFrame({
            ...base,
            pointerInContainer: a.pointerInContainer as NonNullable<
              PasteCoordInput["pointerInContainer"]
            >,
          })
        : resolvePasteFrame(base);
    },
    pasteSpecial: PASTE_SPECIAL_HANDLERS as Readonly<Record<string, StyleHandler>>,
  });

  // WI-025 (DR-025 S3 increment 3) — duplicate (single + batch) absorbed into
  // the editing-command kit. Deep-clone (fresh ids) → nudge the root frame →
  // stage as a sibling via self-contained item.create; one transaction → one
  // Cmd+Z. weave injects only the NAME + its MAX_PASTE_NODES cap (offset
  // defaults to the same 0.02). Same behavior + error codes (item-not-found /
  // no-parent / subtree-too-large) as the prior inline bodies.
  const duplicateItem = createDuplicateItemCommand({
    name: "weave.item.duplicate",
    maxNodes: MAX_PASTE_NODES,
  });
  const duplicateItems = createDuplicateItemsCommand({
    name: "weave.items.duplicate",
    maxNodes: MAX_PASTE_NODES,
  });

  // ─── WI-020 / WI-043 — explicit layout mutations ──────────────────────
  //
  // `weave.frame.setLayout` and `weave.item.setLayoutChild` directly emit
  // the agocraft `item.layout` / `item.layoutChild` Patch variants. These
  // are self-inverting via before/after swap, and `mergeKeyOf` folds rapid
  // SegmentedControl flips on the same item into a single undo entry.
  //
  // Why dedicated commands (vs threading through `weave.item.update`):
  //   1. The agocraft Patch variant is semantic — invertPatch + sync
  //      bridge treat it as a typed layout policy change rather than a
  //      generic attrs diff.
  //   2. The ContextualToolbar's SegmentedControl can invoke these by
  //      name without constructing a full WeaveItem projection.
  //   3. Hosts using the SDK get a typed surface for layout changes.

  // WI-025 (DR-025 S3 increment 4) — the 5 layout commands absorbed into the
  // @agocraft/layout command kit (they live in the layout package because they
  // are thin shells over the LayoutEngine, which already lives there). weave
  // injects only the NAME + its engine accessor (`getLayoutEngine`) + the
  // `LAYOUT_FEATURE_ENABLED` gate. Same behavior + `item-not-found` error code
  // as the prior inline bodies (setFrameLayout is intentionally ungated).
  const layoutGate = () => LAYOUT_FEATURE_ENABLED;
  const setFrameLayout = createSetFrameLayoutCommand({
    name: "weave.frame.setLayout",
    getEngine: getLayoutEngine,
  });
  const setItemLayoutChild = createSetItemLayoutChildCommand({
    name: "weave.item.setLayoutChild",
    getEngine: getLayoutEngine,
    enabled: layoutGate,
  });
  const swapGridCells = createSwapGridCellsCommand({
    name: "weave.item.swapGridCells",
    getEngine: getLayoutEngine,
    enabled: layoutGate,
  });
  const swapFlexOrder = createSwapFlexOrderCommand({
    name: "weave.item.swapFlexOrder",
    getEngine: getLayoutEngine,
    enabled: layoutGate,
  });
  const dropGridCell = createDropGridCellCommand({
    name: "weave.item.dropGridCell",
    getEngine: getLayoutEngine,
    enabled: layoutGate,
  });

  return [
    addItem as Command,
    removeItem as Command,
    removeItems as Command,
    updateItem as Command,
    setShapeCornerRadius as Command,
    setShapeFill as Command,
    resizeMulti as Command,
    alignItems as Command,
    itemsUpdate as Command,
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
    setPolyVertices as Command,
    removeFrameKeepingChildren as Command,
    addBehavior as Command,
    removeBehavior as Command,
    insertPresetSlide as Command,
    clipboardCopy as Command,
    clipboardCut as Command,
    clipboardPaste as Command,
    duplicateItem as Command,
    duplicateItems as Command,
    // WI-020 / WI-043
    setFrameLayout as Command,
    setItemLayoutChild as Command,
    swapGridCells as Command,
    swapFlexOrder as Command,
    dropGridCell as Command,
    // DR-028 — decoration as units (shadow/stroke/fill/filter/opacity). The
    // agocraft kit owns the patch semantics; weave just names + uses it.
    createSetDecorationCommand("weave.item.setDecoration") as Command,
  ];
}

/** Register the command set on an editor. Returns a single teardown that
 *  unregisters all commands. Creation / removal commands emit self-contained
 *  `item.create` / `unit.create` / `item.remove` / `unit.remove` patches
 *  (WI-024) — no `PendingCreations` side-channel. */
export function registerWeaveCommands(
  editor: Editor,
  targets: WeaveCommandTargets,
  presetRegistry?: PresetRegistry,
): () => void {
  const commands = buildWeaveCommands(targets, presetRegistry);
  const registry = editor.container.resolve(CommandRegistryToken);
  const offs: Array<() => void> = [];
  for (const cmd of commands) {
    offs.push(registry.register(cmd));
  }
  return () => {
    for (const off of offs) off();
  };
}
