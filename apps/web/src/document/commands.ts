// WI-013 / WI-024 / WI-156 — weave doc mutations as `@agocraft/editor` Commands.
//
// **Every command is patch-emitting and lossless.** A command reads the current
// doc via `ctx.document` and returns real, self-contained `Patch[]` describing
// the change. The TransactionRunner emits Changes; `useDocument`'s ChangeStream
// subscriber applies them via `applyChangeToDocument`; History sees real patches.
// Adds/removes carry the FULL subtree in the patch (WI-024 / DR-026):
//   • `weave.item.add`     → `item.create { parentId, position, item: SerializedItem }`
//   • `weave.item.remove`  → `item.remove { parentId, position, item: SerializedItem }`
//   • behavior add/remove  → `unit.create` / `unit.remove` (full Unit body)
// so undo/redo and remote sync need no `PendingCreations` side-channel. (The old
// "Direct, no item.create patch type" model this header used to describe was
// retired by WI-024 — agocraft core has carried `item.create`/`item.remove`
// since v9 / WI-018. See DR-112.)
//
// **The single exception is `weave.doc.reset`** — it mutates host state via
// `targets.reset()` and emits NO patch. It is therefore a declared *snapshot
// boundary* (`SNAPSHOT_BOUNDARY_COMMANDS` below), not a loss: the future delta
// sink treats it as "drop the patch log, start a fresh snapshot". This is the
// ONLY way a command reaches host state outside the patch stream — enforced by
// `WeaveCommandTargets` exposing only `{ reset }` (WI-156 / DR-112 A3).

import type {
  Item as AgocraftItem,
  BuiltinItemFrame as AgocraftItemFrame,
  Unit as AgocraftUnit,
  LayoutChildPolicy,
  LayoutSpec,
} from "@agocraft/core";
import {
  type AxisSizingPair,
  type ClipboardTransport,
  type Command,
  type CommandContext,
  createAutoFlexChildPolicy,
  createAutoFlexSpec,
  createAutoGridSpec,
  createBreakShapeToLineCommand,
  createClipboardCommands,
  createCloseLineToShapeCommand,
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
  fail,
  itemId as makeItemId,
  unitId as makeUnitId,
  mapItemDeep,
  moveAboveCommand,
  moveBelowCommand,
  moveToBottomCommand,
  moveToTopCommand,
  ok,
  type Patch,
  SHAPE_SUB_KINDS,
  type ShapeSubKind,
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
  gridSpecForChildCount,
  gridSpecWithMinTracks,
  refitHugContainer,
  reflowHugOnResize,
} from "@agocraft/layout";
import { nn } from "../lib/nn.js";
import {
  absoluteFrameBox,
  applyChangeToDocument,
  applyCreationUnits,
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
import {
  isOfficePasteHint,
  type PasteCoordInput,
  resolvePasteFrame,
} from "./clipboard/paste-coord.js";
import {
  buildDatasetUnit,
  type DatasetPayload,
  findDatasetUnit,
  nextDatasetId,
  normalizeDatasetPayload,
  readDatasetPayload,
} from "./dataset/dataset-store.js";
import { isContainerKind } from "./domain-kinds.js";
import type { ChartEncoding, ChartType, ChartVariant } from "./domains/chart/chart-model.js";
// WI-051 Step 3 / 3.5 — engine-side text measurement, injected into Hug reflow +
// the content-auto (non-Hug) `reflowMeasuredText` trigger (OFF by default until
// live-verified; see `layout/text-measurer.js`).
import { getDesignDims } from "./layout/design-dims.js";
import { pinAutoLayoutPx, stagePinned } from "./layout/pin-auto-layout-px.js";
import { getLayoutEngine, LAYOUT_FEATURE_ENABLED } from "./layout/registry.js";
import { reparentTextHugPatches } from "./layout/reparent-text-hug.js";
import { textHugChildPolicy, textHugFrameRatio } from "./layout/text-layout-fit.js";
import { engineTextMeasureEnabled, measureTextInput } from "./layout/text-measurer.js";
import {
  ALIGN_OPS_ORDER,
  type AlignInput,
  type AlignOp,
  computeAlignedFrames,
} from "./multi/align-ops.js";
import {
  collectPresentationIds,
  FRAME_KINDS,
  reconcilePresentationOrder,
} from "./presentation-order.js";
import { defaultPresetRegistry } from "./presets/default-registry.js";
import type { PresetRegistry } from "./presets/types.js";
import { ratioFontReparentPatches } from "./reparent-font.js";
import type { Result, WeaveError } from "./result.js";
import { createDefaultItem } from "./seed.js";
import { parseVarRef } from "./style/theme-tokens.js";
import { applyEffects } from "./transaction/effect-pipeline.js";
import type { EffectMeta } from "./transaction/transaction-effect.js";
import { CROP_OFFSET_UNIT_KIND } from "./transform-crop-offset.js";
import {
  type DomainKind,
  FULL_FRAME,
  type InteractionBehavior,
  type ItemFrame,
  type Item as WeaveItem,
} from "./types.js";
import { cropWindowUnit } from "./units/crop-window-unit.js";
import { fillUnit } from "./units/fill-unit.js";
import { flipUnit } from "./units/flip-unit.js";
import { getUnitModel } from "./units/unit-registry.js";

/** Slice of useDocument's callback surface used by the *direct* commands
 *  (add / remove / reset). In-place commands no longer call into this.
 *
 *  WI-032 Phase 3b — `updateShape` / `removeShape` were removed alongside
 *  the legacy `canvas-design.attrs.shapes[]` data shape. Shape primitives
 *  are now first-class Items; their attrs flow through `updateItem`. */
// WI-156 / DR-112 A3 — the ONLY host-state hook a command may reach outside the
// patch stream. Every other mutation flows through `ctx.document` → `Patch[]`, so
// the patch stream is a complete substitute for the full snapshot. `reset` stays
// here because it clears the doc wholesale (a snapshot boundary, not a patch).
// The pre-WI-024 members (addItem/removeItem/updateItem/updateBehavior) were
// vestigial — no command called them once add/remove became `item.create`/
// `item.remove` patches — so they are removed. Widening this interface again is
// the deliberate act required to introduce a new bypass; the type guards it.
export interface WeaveCommandTargets {
  readonly reset: () => void;
}

/**
 * WI-156 / DR-112 — commands that mutate document state OUTSIDE the patch stream
 * and must therefore be treated as snapshot boundaries by any delta-persistence
 * sink ("drop the patch log, take a fresh snapshot"). Single source of truth —
 * the completeness gate (commands.test.ts) asserts this set stays exact, and the
 * future delta sink reads it instead of hard-coding the name. Today `reset` is
 * the only such command (it emits `[]` and calls `targets.reset()`).
 */
export const SNAPSHOT_BOUNDARY_COMMANDS: ReadonlySet<string> = new Set(["weave.doc.reset"]);

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
  /** WI-063 — decoration units to attach AT CREATION so the item is added
   *  fully-styled in one call (no follow-up setFill / setDecoration). Each
   *  `{ kind, attrs }` overlays onto the seeded units, replacing any of the same
   *  kind. Decoration kinds: decoration.fill (attrs = PaintSpec) / .stroke /
   *  .shadow / .filter / .opacity. */
  readonly units?: ReadonlyArray<{
    readonly kind: string;
    readonly attrs?: Readonly<Record<string, unknown>>;
  }>;
  /** WI-147 — agent-only min-size guard. When `true`, the add is REJECTED (no
   *  patches, nothing created) if the item's final rendered px size falls below
   *  the legibility floor (see `checkAddedItemMinSize`). Set ONLY by the aku
   *  agent's `transformInput` (manual toolbar adds never pass it), so a person
   *  deliberately drawing a tiny element is never blocked — only the agent is.
   *  Requires `designWidth` + `designHeight` to resolve ratios → px. */
  readonly enforceMinSize?: boolean;
  /** WI-147 — live design pixel size, used with `enforceMinSize` to convert the
   *  staged 0..1 ratio frame into an absolute px size. Same source/semantics as
   *  the `designWidth/Height` on reparent. */
  readonly designWidth?: number;
  readonly designHeight?: number;
  /** WI-150 — agent-only container-is-frame guard. When `true`, the add is
   *  REJECTED if `containerId` resolves to a non-frame LEAF (text / shape /
   *  image / …) — only a `frame` (or the doc root) can hold children. Set ONLY
   *  by aku's `transformInput` (manual toolbar adds never pass it). Catches the
   *  agent chaining `containerId` onto the last leaf it created (e.g. dumping
   *  every calendar date under the "SAT" header text) instead of the region's
   *  layout frame. Needs no design px, so it is stamped unconditionally. */
  readonly enforceContainerIsFrame?: boolean;
  /** WI-199 / DR-128 — agent-only grid-capacity guard. When `true` and the
   *  container is an "auto-managed" auto-grid (no `areas` / `*Repeat`), the add
   *  GROWS the grid's track count (`gridSpecForChildCount`) if the new child
   *  would otherwise exceed capacity and stack onto the last cell. Set ONLY by
   *  aku's `transformInput` — manual toolbar adds keep their deliberate track
   *  count untouched. */
  readonly enforceGridCapacity?: boolean;
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
   *  (e.g. the full `frame`) — a partial replaces the whole key. */
  readonly attrs?: Readonly<Record<string, unknown>>;
  /** WI-063 — decoration units to set/replace/clear in the SAME call as `attrs`,
   *  so a styled edit is one tool call (no separate setFill / setDecoration). Each
   *  `{ kind, attrs }` is applied like weave.item.setDecoration: attrs = the spec
   *  to set (decoration.fill = PaintSpec, .shadow / .stroke / .filter / .opacity),
   *  or `null` to clear that decoration. At least one of `attrs` / `patch` /
   *  `units` must be provided. */
  readonly units?: ReadonlyArray<{
    readonly kind: string;
    readonly attrs?: Readonly<Record<string, unknown>> | null;
  }>;
  /** DR-053 (d) — active resize-gesture id (pointerdown→up). When set, the
   *  engine rescales descendants from the gesture-start baseline so a parent
   *  shrink→grow restores them to their mouse-down sizes. Omit for non-gesture
   *  programmatic frame writes. */
  readonly sessionId?: string;
  /** WI-043 P4 — design-plane px basis. When supplied, the engine reflow lays
   *  auto-flex/grid containers with FIXED-px gap/padding (`spec.gapPx`/`paddingPx`)
   *  instead of the legacy ratio gap/padding. Omit ⇒ ratio (no change). */
  readonly designWidth?: number;
  readonly designHeight?: number;
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

/** WI-074 / DR-029 — interactive image crop. Targets `attrs.cropRatio`
 *  (`ImageCrop` = `{ x, y, w, h, rotation? }`, all 0..1 except `rotation` in
 *  radians). The renderer (`ImageBlock`) applies the window + content rotation.
 *  Image-only. `crop` defines the visible window in display space; `rotation`
 *  (DR-029 D6) is the Canva-style content straighten (frame stays fixed).
 *  No-crop = `{ x:0, y:0, w:1, h:1 }` with `rotation` omitted. */
export interface SetImageCropInput {
  readonly itemId: string;
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  /** Content rotation (radians). Omitted = 0. */
  readonly rotation?: number;
  /** WI-074 D12 — image-offset (frame-box fractions) for panning within the rotation
   *  cover-zoom magnification. Stored as the weave-local `crop.offset` unit. When
   *  omitted or {0,0} the unit is cleared. */
  readonly offset?: { readonly ox: number; readonly oy: number };
}

/** WI-074 / DR-029 D7 — toggle a horizontal / vertical flip on an item. Stored as
 *  a kind-agnostic `transform.flip` UNIT, applied at NestedFrame as a frame-centre
 *  mirror — so cropped content keeps its visible region (only the display flips).
 *  Allowed kinds: image / video / shape / line (qr/text/frame excluded). */
export interface FlipItemInput {
  readonly itemId: string;
  readonly axis: "horizontal" | "vertical";
}

/** WI-020 / WI-043 — explicit layout-spec mutation. Targets `attrs.layout`
 *  via the agocraft `item.layout` Patch variant (self-inverting before/after
 *  swap, mergeKeyOf folds rapid SegmentedControl flips into one undo). */
export interface SetFrameLayoutInput {
  readonly itemId: string;
  /** New `LayoutSpec`, or `undefined` to clear the policy. */
  readonly layout: import("@agocraft/core").LayoutSpec | undefined;
  /** WI-043 P6 — live design px. When supplied, a FIXED-px gap/padding
   *  (`gapPx`/`paddingPx`) container lays children at exact px on the paradigm
   *  switch (the host resolves the frame's absolute box). Omit ⇒ ratio. */
  readonly designWidth?: number;
  readonly designHeight?: number;
}

/** WI-020 / WI-043 — explicit child-policy mutation. Targets
 *  `attrs.layoutChild` via the agocraft `item.layoutChild` Patch variant. */
export interface SetItemLayoutChildInput {
  readonly itemId: string;
  /** New `LayoutChildPolicy`, or `undefined` to clear. */
  readonly policy: import("@agocraft/core").LayoutChildPolicy | undefined;
  /** WI-043 P6 — live design px. When supplied, the parent re-lays-out with
   *  FIXED-px gap/padding (the engine resolves the parent box). Omit ⇒ ratio. */
  readonly designWidth?: number;
  readonly designHeight?: number;
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

/** Minimum non-degenerate frame side (ratio of the parent box). Below this an
 *  item's on-screen AREA can fall under the pointer-events hit-test threshold
 *  (`HIT_THRESHOLD_AREA_PX2`), which sets `pointer-events:none` — the item then
 *  cannot be clicked, selected, or edited. */
const MIN_FRAME_SIDE = 1e-3;
// DR-082 — a frame side (ratio of the parent, 0..1) above this is almost
// certainly a px / percent magnitude the caller mis-entered into a RATIO slot
// (e.g. width:24 meaning 24px/24% → 2400% of the parent). Intentional bleed /
// overflow stays well under this, so we only restore the obviously-wrong ones.
const MAX_FRAME_SIDE = 3;
// DR-082 — a fontSizeSpec `{kind:'ratio'}` value is a fraction of the parent
// frame's height (0..~1 in every real design). A value above this is a px size
// the caller mis-tagged as ratio: resolveFontSize would blow it up to
// value × parentHeight (24 → ~25000px). We re-tag those as px.
const MAX_FONT_RATIO = 1;

/** DR-082 — re-tag a px size mis-declared as a ratio fontSize. A `fontSizeSpec`
 *  `{ kind:'ratio', value }` resolves to `value × parentHeight`, so a whole-number
 *  magnitude (24, 48) is the #1 "text drawn ~1000× too large" agent bug: the
 *  caller meant 24px but tagged it ratio. We coerce `{kind:'ratio', value>1}` to
 *  `{kind:'px', value}` so it renders at the intended absolute size. Pure; the
 *  inverse error (a 0..1 fraction in the legacy plain `fontSize` → sub-pixel) is
 *  left to prompt guidance — the command can't recover the intended px without the
 *  parent height. Applied on the merged attrs of every text add / update. */
function sanitizeFontSizeSpec(
  attrs: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const spec = attrs.fontSizeSpec;
  if (
    isPlainObject(spec) &&
    spec.kind === "ratio" &&
    typeof spec.value === "number" &&
    Number.isFinite(spec.value) &&
    spec.value > MAX_FONT_RATIO
  ) {
    if (import.meta.env.DEV) {
      console.warn(
        `[weave] fontSizeSpec ratio value ${spec.value} > ${MAX_FONT_RATIO} — re-tagged as px ` +
          "(a ratio fontSize is a 0..1 fraction of the parent height; this looked like a px size mis-tagged as ratio)",
        spec,
      );
    }
    return { ...attrs, fontSizeSpec: { kind: "px", value: spec.value } };
  }
  return attrs;
}

/** Guard an added item against a ZERO/degenerate frame that would render at zero
 *  area and become unselectable / uneditable. The agent sometimes adds an item
 *  without a usable position+size — especially when it treats an ABSOLUTE
 *  container as an auto-layout one and omits (or zeroes) the frame, since an
 *  absolute parent does NOT auto-position its children. We restore the kind's
 *  seed size for any missing/zero dimension, keeping whatever valid position the
 *  caller did provide. Text auto-fits its HEIGHT (frame.width drives wrapping),
 *  so a finite text height (incl. 0) is left to the auto-fit; every other kind
 *  needs a positive height too. Pure — unit-tested in commands.test. */
function ensureUsableFrame(kind: string, frame: unknown, seed: ItemFrame): ItemFrame {
  const f = isPlainObject(frame) ? frame : {};
  const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  const positive = (v: unknown, fallback: number): number =>
    fin(v) && v > MIN_FRAME_SIDE ? v : fallback;
  const autoHeight = kind === "text";
  // DR-082 — a side > MAX_FRAME_SIDE is a px / percent magnitude mis-entered into
  // a 0..1 ratio slot (width:24 → 2400% of the parent). Restore the seed size for
  // those; positions (x/y) and modest overflow (≤300%, intentional bleed) pass
  // through. Keeps the same "make it usable + DEV warn" contract as the zero guard.
  const sane = (v: unknown, fallback: number): number => {
    const w = positive(v, fallback);
    if (w > MAX_FRAME_SIDE) {
      if (import.meta.env.DEV) {
        console.warn(
          `[weave] frame side ${w} > ${MAX_FRAME_SIDE} (ratio of parent) — restored seed ` +
            "(frame sides are 0..1 of the parent; this looked like a px/percent value mis-entered as a ratio)",
          { side: w, restored: fallback },
        );
      }
      return fallback;
    }
    return w;
  };
  return {
    x: fin(f.x) ? f.x : seed.x,
    y: fin(f.y) ? f.y : seed.y,
    width: sane(f.width, seed.width),
    // Text height auto-fits — keep a finite caller value; only fill a missing/NaN one.
    height: autoHeight && fin(f.height) ? f.height : sane(f.height, seed.height),
    rotation: fin(f.rotation) ? f.rotation : seed.rotation,
  };
}

// WI-147 — minimum legible size for an AGENT-added item, in absolute design px.
// The agent occasionally emits a frame ratio so small the item renders as an
// invisible speck (a sub-10px box, often from dividing by the wrong parent or
// fat-fingering a ratio). Such an item is unusable: it can't be seen, is nearly
// unselectable, and silently bloats the deck. We REJECT the add and hand the
// agent the reason so it re-tries with a real size. The floor is two ANDed
// thresholds (the user's spec): the LONG side ≥ 10px AND the area ≥ 20px². Using
// the LONG side (not the short side) keeps a deliberately-thin element legal — a
// 2px×400px divider passes (long 400, area 800) while a 3px×3px speck is rejected
// — so BOTH thresholds bite independently (a long-but-hairline 200px×0.05px sliver
// clears the side rule yet fails the area rule).
export const MIN_ITEM_SIDE_PX = 10;
export const MIN_ITEM_AREA_PX2 = 20;
// Kinds whose box does NOT have a meaningful axis-aligned long-side + area pair at
// add time, so the box rule would wrongly reject a legitimate one:
//  • text  — HEIGHT auto-fits its wrapped content (unknown until rendered); only
//    the WIDTH is bound by the frame, so we check width alone.
//  • line  — a 1-D primitive defined by points; its bbox is thin by nature, so we
//    check its LENGTH (the longer extent) alone, skipping the area rule.
const AUTO_HEIGHT_KINDS: ReadonlySet<string> = new Set(["text"]);
const ONE_D_KINDS: ReadonlySet<string> = new Set(["line"]);

export interface MinItemSizeVerdict {
  readonly ok: boolean;
  /** Human-readable reason (Korean — surfaced to the agent) when `ok` is false. */
  readonly reason?: string;
}

/** Pure legibility check for an item about to be added, given its final px size.
 *  `wPx`/`hPx` are the staged frame resolved to absolute design px. Kind-aware
 *  (see `AUTO_HEIGHT_KINDS` / `ONE_D_KINDS`). WI-147 — unit-tested. */
export function checkAddedItemMinSize(kind: string, wPx: number, hPx: number): MinItemSizeVerdict {
  const r = (n: number): number => Math.round(n * 10) / 10;
  if (ONE_D_KINDS.has(kind)) {
    const len = Math.max(wPx, hPx);
    if (len >= MIN_ITEM_SIDE_PX) return { ok: true };
    return { ok: false, reason: `선 길이 ${r(len)}px < 최소 ${MIN_ITEM_SIDE_PX}px` };
  }
  if (AUTO_HEIGHT_KINDS.has(kind)) {
    if (wPx >= MIN_ITEM_SIDE_PX) return { ok: true };
    return {
      ok: false,
      reason: `너비 ${r(wPx)}px < 최소 ${MIN_ITEM_SIDE_PX}px (텍스트는 높이가 내용에 맞춰 자동이라 너비만 검사)`,
    };
  }
  const longSide = Math.max(wPx, hPx);
  const area = wPx * hPx;
  if (longSide >= MIN_ITEM_SIDE_PX && area >= MIN_ITEM_AREA_PX2) return { ok: true };
  return {
    ok: false,
    reason:
      `크기 ${r(wPx)}×${r(hPx)}px (긴 변 ${r(longSide)}px, 면적 ${r(area)}px²) — ` +
      `최소 긴 변 ${MIN_ITEM_SIDE_PX}px AND 면적 ${MIN_ITEM_AREA_PX2}px² 필요`,
  };
}

/** Deep-merge `after` over `before`, RECURSING into plain-object values so a
 *  PARTIAL nested object (e.g. a chart's `overrides.datum` carrying one new
 *  category) EXTENDS the existing one instead of replacing it wholesale. A
 *  `null` value DELETES that key (the explicit "clear" signal); arrays and
 *  scalars replace wholesale. Used by the chart attrs normalizer so the agent's
 *  declarative partial edits don't wipe sibling emphasis / variant flags — the
 *  UI avoids the same trap via the imperative `patch` form (WI-092 후속2). */
function deepMergePreserve(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(after)) {
    if (v === null) {
      delete out[k];
      continue;
    }
    const bv = out[k];
    out[k] = isPlainObject(bv) && isPlainObject(v) ? deepMergePreserve(bv, v) : v;
  }
  return out;
}

/** WI-094 — chart partial-edit safety. `weave.item.update` shallow-merges the
 *  caller's `attrs` over the item's current attrs, so a partial `variant` /
 *  `encoding` / `overrides` REPLACES the whole key — dropping the sibling flags /
 *  channels / per-element emphasis the agent didn't resend (it only holds the
 *  delta). Deep-merge ONLY these three nested-map fields back from `before`, so a
 *  per-element edit ("이 막대만 강조") or a single-flag edit ("도넛으로") is
 *  non-destructive; everything else (frame, chartType, palette[], barWidth, …)
 *  keeps wholesale-replace. A `null` value clears a key. Idempotent for complete
 *  input (the UI patch path already merges), so applying it on every chart
 *  update is safe. */
const CHART_DEEP_MERGE_KEYS: ReadonlyArray<string> = ["variant", "encoding", "overrides"];
function normalizeChartAttrs(
  after: Readonly<Record<string, unknown>>,
  before: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  let next = after;
  for (const key of CHART_DEEP_MERGE_KEYS) {
    const a = next[key];
    const b = before[key];
    if (isPlainObject(a) && isPlainObject(b)) {
      next = { ...next, [key]: deepMergePreserve(b, a) };
    }
  }
  return next;
}

/** WI-094 — text partial-edit + canonical-runs coherence. Since DR-057,
 *  `textRuns` (when present) is the SINGLE SOURCE OF TRUTH for inline content +
 *  per-range typography (부분편집); the plain `text` is only a legacy mirror. A
 *  declarative agent edit must keep the two coherent:
 *    • sets `textRuns` (per-range styling) → sync `text` = the joined run inserts
 *      so the mirror matches the canonical runs.
 *    • sets `text` only (whole-text replace) → re-derive `textRuns` from it
 *      ([{insert:text}] / []), so the change actually shows on a runs-canonical
 *      item (otherwise the stale runs win and the edit is silently ignored) and
 *      the old per-range styling is intentionally reset.
 *  Runs only for the DECLARATIVE path (`provided` given); the UI `patch` form
 *  writes text + textRuns together itself → `provided` undefined → no-op. */
function normalizeTextAttrs(
  after: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  // The UI px/% toggle + slider go through the `patch` form (`provided`
  // undefined). They compute the ratio from the parent height EXPLICITLY and may
  // LEGITIMATELY emit value > 1 — a font taller than a SMALL nested parent frame
  // (curPx / parentHeightPx > 1). Trust that path: running the DR-082 px-mis-tag
  // guard there would re-tag the user's just-chosen ratio back to px, so toggling
  // to "%" on a small-parent text snaps back and the unit flickers px↔% mid-drag.
  // The guard is for the DECLARATIVE / agent path only (where a >1 ratio is a px
  // magnitude the model mis-tagged; DR-091 grounding usually converts it first,
  // this is the fallback).
  if (provided === undefined) return after;
  // DR-082 — re-tag a px font size the agent mis-declared as a ratio (value > 1).
  after = sanitizeFontSizeSpec(after);
  if ("textRuns" in provided) {
    const runs = after.textRuns;
    if (Array.isArray(runs)) {
      const text = runs
        .map((r) => (isPlainObject(r) && typeof r.insert === "string" ? r.insert : ""))
        .join("");
      return { ...after, text };
    }
    // textRuns supplied as null / non-array (e.g. an agent edit clearing runs):
    // treat it as "reset runs" — derive a valid runs array from the current text
    // so a null never persists onto the item (the renderer would deref-crash).
    const text = typeof after.text === "string" ? after.text : "";
    return { ...after, text, textRuns: text.length > 0 ? [{ insert: text }] : [] };
  }
  if ("text" in provided) {
    const text = typeof after.text === "string" ? after.text : "";
    return { ...after, textRuns: text.length > 0 ? [{ insert: text }] : [] };
  }
  return after;
}

/** Per-kind normalizer for the merged `after` of weave.item.update — a registry,
 *  not a switch on `child.kind` (Rule 6). Each entry makes a PARTIAL edit safe /
 *  coherent for that kind: shape keeps subAttrs geometry complete (no render
 *  crash), chart deep-merges variant/encoding/overrides (no sibling wipe), text
 *  keeps text↔textRuns coherent. `provided` is the caller's declarative `attrs`
 *  (undefined for the UI `patch` form). */
type AttrsNormalizer = (
  after: Readonly<Record<string, unknown>>,
  before: Readonly<Record<string, unknown>>,
  provided: Readonly<Record<string, unknown>> | undefined,
) => Readonly<Record<string, unknown>>;
const ATTRS_NORMALIZERS: Partial<Record<DomainKind, AttrsNormalizer>> = {
  shape: (after) => normalizeShapeAttrs(after),
  chart: (after, before) => normalizeChartAttrs(after, before),
  text: (after, _before, provided) => normalizeTextAttrs(after, provided),
};

/** 1-arg per-kind 안전 정규화 — add(weave.item.add) / bulk-update(weave.items.update)
 *  경로용. 병합 인지형(before/provided)은 위 ATTRS_NORMALIZERS, 이건 그것이 없는 경로의
 *  최소 안전 패스다. 레지스트리 lookup으로 분기(`kind ===` 비교 금지 — Rule 6):
 *  shape는 subAttrs 기하 완전성(WI-062), text는 px-오선언 ratio 재태깅(DR-082).
 *  그 외 kind는 원본 그대로. */
const RAW_ATTRS_NORMALIZERS: Partial<
  Record<
    DomainKind,
    (attrs: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>
  >
> = {
  shape: normalizeShapeAttrs,
  text: sanitizeFontSizeSpec,
};
function normalizeAttrsForKind(
  kind: string,
  attrs: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return RAW_ATTRS_NORMALIZERS[kind as DomainKind]?.(attrs) ?? attrs;
}

// WI-077 — seed dataset for a freshly-added chart (weave.chart.add). First
// column = category, the rest = value series. Editable afterwards via the
// dataset panel (Phase 5) / weave.dataset.update.
const SAMPLE_CHART_DATASET: DatasetPayload = {
  name: "샘플 데이터",
  columns: [
    { name: "항목", type: "nominal" },
    { name: "값", type: "quantitative" },
  ],
  rows: [
    { 항목: "A", 값: 30 },
    { 항목: "B", 값: 80 },
    { 항목: "C", 값: 45 },
    { 항목: "D", 값: 60 },
  ],
};

/** Fill the required defaults an auto-flex / auto-grid spec must carry. The
 *  @agocraft/layout engine reads `spec.padding.left` (and other required fields)
 *  UNGUARDED in onParentResize — so a layout the agent stored WITHOUT `padding`
 *  (the schema marks it optional, the engine does not) crashes the next
 *  onChildAdd with "Cannot read properties of undefined (reading 'left')". The
 *  core factories overlay caller fields onto the complete DEFAULT spec, so the
 *  stored layout always has padding/gap/tracks. absolute-constraints needs none. */
function normalizeLayoutSpec(layout: LayoutSpec | undefined): LayoutSpec | undefined {
  if (layout === undefined) return undefined;
  if (layout.kind === "auto-flex") return createAutoFlexSpec(layout);
  if (layout.kind === "auto-grid") return createAutoGridSpec(layout);
  return layout;
}

// ── WI-199 / DR-128 — nested-layout add support ──────────────────────────────
// The @agocraft/layout engine reflows ONE level per call (onChildAdd /
// onFrameChanged reposition a parent's DIRECT children, never grandchildren). So
// adding an item to a NESTED grid/flex left grandchildren stale — visibly broken
// until the user resized a container (which re-runs that one level). The cascade
// helper below closes that gap without re-implementing layout math: it re-enters
// the engine's own reflowSubtree top-down for each nested container the add
// shifted.
//
// WI-217 S4 (DR-138): grid auto-grow is no longer a host helper — `onChildAdd`
// now OWNS it via the `growToFit` flag (engine returns the grown spec as
// `parentPatch`), so the former host-side `grownGridSpec` was removed.

function frameEqualsRatio(
  a: AgocraftItemFrame | undefined,
  b: AgocraftItemFrame | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    (a.rotation ?? 0) === (b.rotation ?? 0)
  );
}

function itemFrameOf(item: AgocraftItem | undefined): AgocraftItemFrame | undefined {
  return (item?.attrs as { frame?: AgocraftItemFrame } | undefined)?.frame;
}

function itemLayoutOf(item: AgocraftItem | undefined): LayoutSpec | undefined {
  return (item?.attrs as { layout?: LayoutSpec } | undefined)?.layout;
}

/** A frame the cascade should descend into: it owns a flex/grid layout AND has
 *  at least one child whose position that layout manages. */
function isReflowContainer(item: AgocraftItem | undefined): boolean {
  if (item === undefined || item.children.length === 0) return false;
  const k = itemLayoutOf(item)?.kind;
  return k === "auto-flex" || k === "auto-grid";
}

/** The frame an `item.attrs` patch SETS (its `after.frame`), if any. */
function frameFromAttrsPatch(p: Patch): AgocraftItemFrame | undefined {
  if (p.type !== "item.attrs") return undefined;
  return (p as { after?: { frame?: AgocraftItemFrame } }).after?.frame;
}

/** #1 — given the sibling-shift patches an add produced, cascade a subtree reflow
 *  into every sibling that is itself a reflow container whose frame changed.
 *
 *  DR-053: the layout CASCADE itself (reflow children → recurse into nested
 *  containers) is now OWNED by the agocraft engine (`reflowSubtree`). The host no
 *  longer recurses — it only maps the add's sibling-shift patches to the engine
 *  call (which sibling changed → reflow its descendants). The engine recurses
 *  internally using its own computed frames (consistent state). */
function cascadeReflowFromSiblingPatches(
  doc: CommandContext["document"],
  siblingPatches: ReadonlyArray<Patch>,
): Patch[] {
  const out: Patch[] = [];
  for (const sp of siblingPatches) {
    if (sp.type !== "item.attrs") continue;
    const sibId = String(sp.itemId);
    const sibNode = findItemDeep(doc, sibId);
    if (sibNode === undefined || !isReflowContainer(sibNode)) continue;
    const sibOld = itemFrameOf(sibNode);
    const sibNew = frameFromAttrsPatch(sp);
    if (sibOld === undefined || sibNew === undefined || frameEqualsRatio(sibOld, sibNew)) {
      continue;
    }
    out.push(
      ...getLayoutEngine().reflowSubtree({
        root: doc.root,
        itemId: sibNode.id,
        oldFrame: sibOld,
        newFrame: sibNew,
      }),
    );
  }
  return out;
}

/** WI-250 / DR-166 — re-stamp a layout reflow-consequence patch as engine-`derived`.
 *  The layout-authoring commands (setSizing / setLayout) RECONSTRUCT clean patches
 *  (so undo `before` == original) from a tagged `refitHugContainer` result; that
 *  reconstruction drops the engine tag. Re-stamping keeps the central effect runner
 *  treating the command as self-reflowed (relayout not re-derived) regardless of how
 *  many descendants the refit touched. Mirrors the engine boundary's own tagging. */
const asReflowDerived = (p: Patch): Patch => ({ ...p, derived: true }) as Patch;

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
      // Seed frame (a non-degenerate default per kind, e.g. FULL_FRAME for text)
      // — captured before overrides so the guard below can restore a missing/zero
      // dimension to it.
      const seedFrame: ItemFrame = (weaveItem.attrs as { frame?: ItemFrame }).frame ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      };
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
      // GUARD (DR-078) — never let an item land with a zero-area frame: it would
      // fail the pointer-events hit-test and be impossible to select/edit. The
      // agent occasionally adds a text without position/size (often mistaking an
      // absolute container for an auto-layout one). Restore the seed size for any
      // missing/zero dimension, keeping any valid position the caller gave.
      {
        const fixed = ensureUsableFrame(
          weaveItem.kind,
          (weaveItem.attrs as { frame?: unknown }).frame,
          seedFrame,
        );
        const prev = (weaveItem.attrs as { frame?: ItemFrame }).frame;
        if (
          import.meta.env.DEV &&
          (prev === undefined || prev.width !== fixed.width || prev.height !== fixed.height)
        ) {
          console.warn(
            `[weave.item.add] guarded a zero/degenerate frame on a "${weaveItem.kind}" item → restored size`,
            { provided: prev, restored: fixed },
          );
        }
        weaveItem = {
          ...weaveItem,
          attrs: { ...weaveItem.attrs, frame: fixed } as typeof weaveItem.attrs,
        };
      }
      // WI-062 / DR-082 — per-kind safety pass via RAW_ATTRS_NORMALIZERS (registry
      // lookup, not a `kind ===` branch — Rule 6): shape keeps subAttrs geometry
      // complete (no render crash), text re-tags a px font mis-declared as a ratio
      // (the #1 "text drawn ~1000× too large" agent bug) before serialization.
      const normalizeAttrs = RAW_ATTRS_NORMALIZERS[weaveItem.kind];
      if (normalizeAttrs !== undefined) {
        weaveItem = {
          ...weaveItem,
          attrs: normalizeAttrs(
            weaveItem.attrs as unknown as Readonly<Record<string, unknown>>,
          ) as unknown as typeof weaveItem.attrs,
        };
      }
      const ts = new Date().toISOString();
      // WI-063 — attach caller-supplied decoration units at creation so the item
      // is added fully-styled in one call (fill / shadow / stroke / …), replacing
      // the seeded defaults by kind. Applied before layout staging so the staged
      // + serialized subtree carries them.
      const agoItem =
        input.units !== undefined && input.units.length > 0
          ? applyCreationUnits(toAgocraftItem(weaveItem, ts), input.units)
          : toAgocraftItem(weaveItem, ts);

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
      // WI-150 / DR-105 — AGENT-ONLY container-is-frame guard. Only a `frame`
      // (or the doc root, kind "weave-doc") can hold children; a text / shape /
      // image / … leaf cannot. The agent sometimes CHAINS containerId onto the
      // LAST leaf it created — e.g. after writing the "SAT" calendar header it
      // kept adding the date texts with containerId = that text, nesting the
      // whole date column UNDER a leaf that then ballooned to swallow the row.
      // Reject it with the reason so the agent retargets to the region's layout
      // FRAME (where each item flows into its own grid cell / flex slot). Gated
      // on `enforceContainerIsFrame`, stamped ONLY by aku's transformInput →
      // manual toolbar adds are never blocked. Root excluded by id (not kind).
      if (
        input.enforceContainerIsFrame === true &&
        containerItem !== undefined &&
        String(containerItem.id) !== String(ctx.document.root.id) &&
        // Containment is a kind fact, not a literal — `isContainerKind` reads it
        // from the spec's `structure`, so a future container kind (e.g. group)
        // is accepted here without editing this guard. Today only frame is a
        // container, so this is exactly the previous `kind !== "frame"` check.
        !isContainerKind(containerItem.kind)
      ) {
        return fail(
          "container-not-frame",
          `weave.item.add 거부: containerId가 "${containerItem.kind}" 아이템을 가리킵니다 — ` +
            `오직 frame만 자식을 담을 수 있습니다. 같은 영역의 항목들(달력 날짜·표 셀·리스트 등)은 ` +
            `모두 그 영역의 layout FRAME을 containerId로 지정해 각자 다음 빈 셀/슬롯으로 흘러가게 하세요. ` +
            `직전에 만든 leaf(텍스트/도형 등)를 containerId로 이어 붙이지 마세요. 한 셀에 여러 개를 ` +
            `넣어야 하면 그 셀에 자체 layout을 가진 중첩 frame을 먼저 만든 뒤 그 안에 추가하세요.`,
        );
      }
      let stagedItem: AgocraftItem = agoItem;
      let layoutSiblingPatches: ReadonlyArray<Patch> = [];
      // WI-199 / DR-128 — when a grid grows to fit the new child the engine emits
      // an `item.layout` patch (its `parentPatch`) so the bigger track count
      // persists & inverts.
      let gridGrowPatch: Patch | undefined;
      if (LAYOUT_FEATURE_ENABLED && containerItem !== undefined) {
        // Normalize the parent's layout for the engine read (④ guard, KEPT):
        // @agocraft/layout's onParentResize dereferences spec.padding.left
        // unguarded, so a parent whose stored layout lacks padding would crash
        // onChildAdd. This guards ANY parent (even a layout stored before
        // normalize-on-set landed, or a partial agent-supplied spec).
        const parentLayout = (containerItem.attrs as { layout?: LayoutSpec } | undefined)?.layout;
        const normalizedLayout = normalizeLayoutSpec(parentLayout);
        const safeParent =
          normalizedLayout !== undefined
            ? { ...containerItem, attrs: { ...containerItem.attrs, layout: normalizedLayout } }
            : containerItem;
        // WI-217 S4 (DR-138) — grid auto-grow is the ENGINE's via `growToFit`: it
        // regenerates the auto-grid track count for the new child count, lays the
        // child + siblings into real cells, and returns the grown spec as
        // `parentPatch`. AGENT-ONLY — only the aku transformInput sets
        // `enforceGridCapacity`; manual toolbar adds keep the author's tracks.
        // WI-043 P6 — when the host knows the design plane (agent surface passes
        // design px), resolve the container's ABSOLUTE box so a FIXED-px gap/
        // padding container lays the new child (+ shifted siblings) at the exact
        // px gap, not a ratio that scales with the container. Omit ⇒ ratio.
        const parentBox =
          typeof input.designWidth === "number" &&
          typeof input.designHeight === "number" &&
          input.designWidth > 0 &&
          input.designHeight > 0
            ? absoluteFrameBox(
                ctx.document,
                String(container.id),
                input.designWidth,
                input.designHeight,
              )
            : null;
        // DR-157 — a TEXT entering a layout container fits via the SINGLE shared seam
        // (text-layout-fit.ts), identical to paste + reparent. For an auto-flex parent
        // PRE-seed the staged frame to the measured content size so onChildAdd lays its
        // siblings out against the content in one step (the FULL_FRAME default made a
        // short text fill the slot — operator report). Grid is left as the cell (the
        // render font shrink-to-fit handles overflow); the shared hug policy is stamped
        // after placement (below). Container box from `getDesignDims()` — manual toolbar
        // adds don't pass input.designWidth/Height, so `parentBox` is null for them.
        let childForAdd = agoItem;
        const dims = getDesignDims();
        const hugBox =
          dims !== undefined
            ? absoluteFrameBox(ctx.document, String(container.id), dims.w, dims.h)
            : parentBox;
        const fitFlexText =
          engineTextMeasureEnabled() &&
          agoItem.kind === "text" &&
          normalizedLayout?.kind === "auto-flex" &&
          hugBox !== null;
        if (fitFlexText) {
          const at = agoItem.attrs as Record<string, unknown>;
          const srcFrame = at.frame as ItemFrame | undefined;
          const hug = srcFrame !== undefined ? textHugFrameRatio(at, hugBox, hugBox.h) : undefined;
          if (srcFrame !== undefined && hug !== undefined) {
            childForAdd = {
              ...agoItem,
              attrs: {
                ...at,
                frame: { ...srcFrame, width: hug.width, height: hug.height },
              } as AgocraftItem["attrs"],
            };
          }
        }
        const result = getLayoutEngine().onChildAdd({
          parent: safeParent,
          newChild: childForAdd,
          growToFit: input.enforceGridCapacity === true,
          ...(parentBox !== null ? { parentPx: { w: parentBox.w, h: parentBox.h } } : {}),
        });
        stagedItem = result.stagedChild as AgocraftItem;
        layoutSiblingPatches = result.siblingPatches;
        gridGrowPatch = result.parentPatch;
        // DR-157 — stamp the SHARED hug policy on the placed text so add matches reparent
        // (content-hug `basis:"auto"`, not the engine-derived frozen basis).
        if (fitFlexText) {
          const policy = textHugChildPolicy(normalizedLayout?.kind);
          if (policy !== undefined) {
            stagedItem = {
              ...stagedItem,
              attrs: { ...stagedItem.attrs, layoutChild: policy } as AgocraftItem["attrs"],
            };
          }
        }
      }

      // WI-147 — AGENT-ONLY min-size guard. We compute the STAGED frame (post
      // layout) in absolute px and reject an item too small to be legible, so
      // nothing is created and the agent gets the reason. Gated on
      // `input.enforceMinSize` + design px (only the aku transformInput passes
      // them) → manual toolbar adds are never affected. Fails OPEN: if the px
      // can't be resolved (missing ancestor frame), we allow the add.
      if (
        input.enforceMinSize === true &&
        typeof input.designWidth === "number" &&
        typeof input.designHeight === "number" &&
        input.designWidth > 0 &&
        input.designHeight > 0
      ) {
        const containerBox = absoluteFrameBox(
          ctx.document,
          String(container.id),
          input.designWidth,
          input.designHeight,
        );
        const stagedFrame = (stagedItem.attrs as { frame?: ItemFrame }).frame;
        if (containerBox !== null && stagedFrame !== undefined) {
          const wPx = containerBox.w * stagedFrame.width;
          const hPx = containerBox.h * stagedFrame.height;
          const verdict = checkAddedItemMinSize(stagedItem.kind, wPx, hPx);
          if (!verdict.ok) {
            return fail(
              "item-too-small",
              `weave.item.add 거부: 추가하려는 "${stagedItem.kind}" 아이템의 최종 렌더 크기가 ` +
                `너무 작습니다 — ${verdict.reason}. 보이지 않을 만큼 작아 생성하지 않았습니다. ` +
                `frame.width/height(부모 대비 0..1 비율)를 키우거나 더 큰 컨테이너에 배치한 뒤 다시 추가하세요.`,
            );
          }
        }
      }

      // WI-199 / DR-128 #1 — cascade a subtree reflow into every sibling that is
      // itself a nested flex/grid container whose frame this add changed. The
      // engine reflows one level only, so without this a nested container's
      // grandchildren stay sized for its OLD box (visibly broken until a manual
      // resize re-runs that level). No-op when the changed siblings are leaves.
      const cascadePatches: ReadonlyArray<Patch> =
        LAYOUT_FEATURE_ENABLED && layoutSiblingPatches.length > 0
          ? cascadeReflowFromSiblingPatches(ctx.document, layoutSiblingPatches)
          : [];

      // WI-024 Phase 2b — emit self-contained `item.create` (carries the full
      // subtree); `applyPatch` materializes it and its inverse removes it. No
      // PendingCreations side-channel.
      const patches: Patch[] = [
        ...(gridGrowPatch !== undefined ? [gridGrowPatch] : []),
        {
          type: "item.create",
          parentId: container.id,
          position: container.children.length,
          item: serializeItemSubtree(stagedItem),
        },
        ...layoutSiblingPatches,
        ...cascadePatches,
      ];

      // WI-051 Step 3.5 — engine-measured content sizing for an added TEXT in a
      // content-auto flex/grid slot (the non-Hug path). Build the POST-ADD doc
      // (staged item appended + sibling/cascade frames applied), let the ENGINE
      // measure the text itself and correct its content-auto axes, and FOLD the
      // correction into this same transaction (one undo). The host stays hands-off:
      // it provides the post-add tree + design basis; the engine owns measurement +
      // policy. OFF by default (flag) and no-op without a measurer / design basis /
      // a content-auto axis ⇒ zero behavior change until live-verified.
      if (
        engineTextMeasureEnabled() &&
        stagedItem.kind === "text" &&
        typeof input.designWidth === "number" &&
        typeof input.designHeight === "number" &&
        input.designWidth > 0 &&
        input.designHeight > 0
      ) {
        let postRoot = mapItemDeep(ctx.document.root, container.id, (c) => ({
          ...c,
          children: [...c.children, stagedItem],
        }));
        for (const p of [...layoutSiblingPatches, ...cascadePatches]) {
          if (p.type === "item.attrs") {
            const ap = p as { itemId: AgocraftItem["id"]; after: AgocraftItem["attrs"] };
            postRoot = mapItemDeep(postRoot, ap.itemId, (it) => ({ ...it, attrs: ap.after }));
          }
        }
        patches.push(
          ...getLayoutEngine().reflowMeasuredText({
            root: postRoot,
            itemId: stagedItem.id,
            designWidth: input.designWidth,
            designHeight: input.designHeight,
          }),
        );
      }
      // WI-250 — group-hug / relayout now attach via the CENTRAL effect runner
      // (`withEffects`). The add's own sibling/grid/subtree reflow patches are
      // engine-tagged `derived`, so the pipeline ignores them and reacts only to
      // this command's PRIMARY `item.create` (group-hug grows the container) — the
      // exact effect the former inline `applyEffects(ctx, [createPatch], …)` had,
      // now with no per-site curation.
      return ok(String(stagedItem.id), patches);
    },
  };
  // WI-025 (DR-025 S3) — generic remove absorbed into the @agocraft/core
  // editing-command kit. weave injects only the command NAME; the kit derives
  // the item's actual parent (so nested removals emit a correct structural
  // patch) and emits the self-contained `item.remove` (WI-024). Identical
  // behavior + error code (`item-not-found`) to the prior inline body.
  // WI-248 — group dissolve/shrink-on-remove and group-hug refit are now
  // registered transaction effects (group-dissolve-effect.ts / group-hug-effect.ts);
  // the remove / update / add commands route their primary patches through
  // `applyEffects`. The former inline closures + the per-gesture g0 cache moved
  // into those effect modules (HANDOFF-003 fold-in).
  const removeItemKit = createRemoveItemCommand("weave.item.remove");
  // WI-242 A3 — dissolve decorator: append group-underflow dissolve patches in
  // the same transaction so removing a group's 2nd-to-last child auto-ungroups.
  const removeItem: typeof removeItemKit = {
    name: removeItemKit.name,
    run: (ctx, input) => removeItemKit.run(ctx, input),
    // WI-250 — group dissolve/shrink-on-underflow attaches via the central effect
    // runner (group-dissolve-effect reacts to the primary `item.remove`).
  };
  // WI-025 (DR-025 S3) — batch remove absorbed into the editing-command kit.
  // Every selected item removed in ONE transaction so a single Cmd+Z restores
  // them all; each removal patch targets the item's OWN parent (resolved from
  // the pre-mutation doc) so items across different parents delete correctly.
  const removeItemsKit = createRemoveItemsCommand("weave.items.remove");
  // WI-189 — order decorator over the kit command. The kit records each
  // removal's `position` against the PRE-mutation doc; undo replays the
  // inverses in reverse patch order, so two same-parent siblings removed in
  // ASCENDING index order restore swapped (caught by the mixed rail
  // set-delete e2e; pre-existing for every multi-delete since WI-184).
  // Sorting ids DESCENDING by index-in-parent makes the reversed replay
  // insert ascending — original sibling order restores exactly. Forward
  // removal is id-based, so the order change has no forward effect.
  // Upstream kit fix handed off to agocraft (HANDOFF — see WI-189).
  // WI-242 A3 — also runs the group dissolve-on-underflow decorator.
  const removeItems: typeof removeItemsKit = {
    name: removeItemsKit.name,
    run: (ctx, input) => {
      const indexOf = (id: string) =>
        findParentAndIndex(ctx.document, makeItemId(id))?.indexInParent ?? -1;
      const sorted = [...input.itemIds].sort((a, b) => indexOf(b) - indexOf(a));
      return removeItemsKit.run(ctx, { ...input, itemIds: sorted });
      // WI-250 — group dissolve/shrink-on-underflow attaches via the central
      // effect runner (group-dissolve-effect reacts to the primary `item.remove`).
    },
  };
  // WI-156 / DR-112 — the sole snapshot-boundary command (see
  // SNAPSHOT_BOUNDARY_COMMANDS). It clears the whole doc via the one allowed
  // host hook and emits NO patch by design; a delta sink reads it as "drop the
  // log, start a fresh snapshot" rather than as a lost mutation.
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

  // WI-063 — shared generic decoration command (set/replace/clear a unit). Used
  // BOTH as the registered `weave.item.setDecoration` command AND inline by
  // `weave.item.update` so a styled edit (attrs + fill/shadow/…) is one call.
  const setDecorationCommand = createSetDecorationCommand("weave.item.setDecoration");

  // WI-247 / DR-163 — the orchestration WRAPPER. Every unit write (the typed
  // commands AND the generic setDecoration / update paths) goes through here, so
  // validation + applicability + normalization happen AUTOMATICALLY from the unit
  // registry — a developer setting a unit can't forget them (the "don't-have-to-
  // be-careful" structure). `null` attrs clear the unit (always allowed). Unmodeled
  // kinds (forward-compat) pass through untouched.
  const emitUnit = (
    ctx: CommandContext,
    commandName: string,
    itemId: string,
    kind: string,
    attrs: Readonly<Record<string, unknown>> | null,
  ) => {
    if (attrs === null) return setDecorationCommand.run(ctx, { itemId, kind, attrs: null });
    const model = getUnitModel(kind);
    if (model === undefined) return setDecorationCommand.run(ctx, { itemId, kind, attrs });
    const child = findChild(ctx.document, itemId);
    if (child === undefined) {
      return fail("item-not-found", `${commandName}: no item with id "${itemId}"`);
    }
    if (!model.appliesTo(child as unknown as AgocraftItem)) {
      return fail(
        "not-applicable",
        `${commandName}: item "${itemId}" cannot carry the "${kind}" unit`,
      );
    }
    const v = model.validate(attrs);
    if (!v.ok) return fail(v.error.code, `${commandName}: ${v.error.message}`);
    return setDecorationCommand.run(ctx, { itemId, kind, attrs: model.toAttrs(v.value) });
  };

  // WI-247 / DR-163 — factory for a typed "set one unit" command: the wrapper
  // injects the whole flow, so a new unit command is one line (no remembered
  // boilerplate). The registered weave.item.setDecoration is itself such a wrapper.
  const makeSetUnitCommand = <I extends { itemId: string }>(
    name: string,
    unit: { kind: string },
    extract: (input: I) => Readonly<Record<string, unknown>> | null,
  ): Command<I, void> => ({
    name,
    run: (ctx, input) => emitUnit(ctx, name, input.itemId, unit.kind, extract(input)),
  });

  // The registered generic setter validates through the registry too (the kit
  // instance above is the raw emit the wrapper composes).
  const setDecorationValidated: Command<{ itemId: string; kind: string; attrs?: unknown }, void> = {
    name: "weave.item.setDecoration",
    run: (ctx, input) =>
      emitUnit(
        ctx,
        "weave.item.setDecoration",
        input.itemId,
        input.kind,
        (input.attrs as Readonly<Record<string, unknown>> | undefined) ?? null,
      ),
  };

  const updateItem: Command<UpdateItemInput, void> = {
    name: "weave.item.update",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.item.update: no item with id "${input.itemId}"`);
      }
      const hasAttrs = input.patch !== undefined || input.attrs !== undefined;
      const hasUnits = input.units !== undefined && input.units.length > 0;
      // WI-063 — accept an attrs edit, a units edit, or both (units-only is valid).
      if (!hasAttrs && !hasUnits) {
        return fail("invalid-input", "weave.item.update: provide `attrs`, `patch`, or `units`");
      }
      const patches: Patch[] = [];

      // ── attrs edit (when provided) ──
      if (hasAttrs) {
        // Project to weave shape so the caller's patcher works against the
        // expected type, then compute the attrs diff.
        const weaveItem: WeaveItem = {
          id: String(child.id),
          kind: child.kind as DomainKind,
          attrs: child.attrs as unknown as WeaveItem["attrs"],
          behaviors: [],
          createdAt: child.meta.createdAt,
        };
        const attrsResult = computeAttrsPatches(ctx, child, weaveItem, input);
        // DR-165 — a typed effect error (e.g. from the pipeline) maps to a fail.
        if (!attrsResult.ok) return fail(attrsResult.error.code, attrsResult.error.message);
        patches.push(...attrsResult.value);
      }

      // ── decoration units edit (WI-063) — reuse setDecoration per unit, all in
      //    this command's single transaction → one undo step ──
      if (hasUnits) {
        for (const u of input.units ?? []) {
          // DR-163 — the wrapper auto-validates each unit via its model.
          const r = emitUnit(ctx, "weave.item.update", input.itemId, u.kind, u.attrs ?? null);
          if (!r.ok) return r;
          patches.push(...r.patches);
        }
      }
      // WI-248 — the group-hug refit is now a registered transaction effect
      // (group-hug-effect.ts). `computeAttrsPatches`'s pipeline pass derives it
      // from the frame's `item.attrs` patch (live-gesture box via meta.sessionId),
      // so a frame edit grows/shrinks its hugging group automatically.
      return ok(undefined, patches);
    },
  };

  // attrs-diff computation for weave.item.update (extracted so the run body can
  // also fold in unit patches). Returns the item.attrs patch plus any LayoutEngine
  // reflow patches a frame change triggers.
  function computeAttrsPatches(
    // WI-250 — relayout is now derived centrally; this helper no longer reads ctx.
    _ctx: CommandContext,
    child: AgocraftItem,
    weaveItem: WeaveItem,
    input: UpdateItemInput,
  ): Result<ReadonlyArray<Patch>, WeaveError> {
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
    // WI-062 / WI-094 — per-kind normalize the merged attrs so a PARTIAL edit is
    // safe/coherent: shape keeps subAttrs geometry complete (→ no render crash);
    // chart deep-merges variant/encoding/overrides so emphasizing one element or
    // toggling one flag doesn't wipe the siblings the agent didn't resend; text
    // keeps text↔textRuns coherent (DR-057 canonical runs) so a whole-text edit
    // shows and per-range typography (부분편집) round-trips. Registry lookup, not
    // a switch on kind (Rule 6). Idempotent for non-registered / complete input.
    const normalize = ATTRS_NORMALIZERS[child.kind as DomainKind];
    const before = child.attrs as unknown as Readonly<Record<string, unknown>>;
    const after = normalize ? normalize(afterRaw, before, input.attrs) : afterRaw;
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
    // WI-249 / DR-164 / WI-250 — the "geometry changed → relayout" consequence is
    // a registered transaction effect (`relayoutEffect`) attached by the CENTRAL
    // runner (`withEffects`): this helper emits only its PRIMARY `item.attrs`
    // patch; the pipeline derives the size-change reflow (LAYOUT_FEATURE_ENABLED +
    // SIZE change, the WI-224 size-only policy). The runner sources meta
    // (sessionId / designWidth / designHeight) from the command input.
    return { ok: true, value: [patch] };
  }

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

  // WI-074 / DR-029 — set an image's crop window (+ optional content rotation).
  // Rebuilds the COMPLETE attrs map with a fresh `cropRatio` (the item.attrs
  // reducer replaces the whole map; other attrs — fit / borderRadius / frame —
  // are preserved verbatim). Image-only. `crop` is the 0..1 display-space window;
  // `rotation` (radians, DR-029 D6) is carried INSIDE `cropRatio` per agocraft
  // DR-037 (ImageCrop.rotation). No-crop = { 0,0,1,1 } + rotation omitted.
  const setMediaCrop: Command<SetImageCropInput, void> = {
    name: "weave.media.setCrop",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.media.setCrop: no item with id "${input.itemId}"`);
      }
      // DR-161 — crop is a kind-agnostic `crop.window` UNIT (no kind gate; only the
      // media renderers read it). DR-163 — the VALIDATION is the unit model's job;
      // the command orchestrates. `appliesTo` is always true for crop, so the only
      // precondition is item-exists (checked above).
      const validated = cropWindowUnit.validate(
        input.crop === undefined ? undefined : { ...input.crop, rotation: input.rotation },
      );
      if (!validated.ok) {
        return fail(validated.error.code, `weave.media.setCrop: ${validated.error.message}`);
      }
      // Write the `crop.window` unit (attrs from the model) + STRIP the legacy
      // attrs.cropRatio so a re-saved doc is fully unit-based (DR-028).
      const patches: Patch[] = [];
      const attrsRec = child.attrs as unknown as Record<string, unknown>;
      if ("cropRatio" in attrsRec) {
        const after: Record<string, unknown> = { ...attrsRec };
        delete after.cropRatio;
        patches.push({ type: "item.attrs", itemId: child.id, before: child.attrs, after });
      }
      const winResult = setDecorationCommand.run(ctx, {
        itemId: input.itemId,
        kind: cropWindowUnit.kind,
        attrs: cropWindowUnit.toAttrs(validated.value),
      });
      if (!winResult.ok) return winResult;
      patches.push(...winResult.patches);
      // WI-074 D12 — persist the image-offset (pan within the rotation magnification)
      // as the weave-local `crop.offset` unit, in the SAME transaction (single undo).
      const off = input.offset;
      if (off !== undefined) {
        const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
        if (!finite(off.ox) || !finite(off.oy)) {
          return fail("invalid-input", "weave.media.setCrop: offset must be finite numbers");
        }
        const offsetResult = setDecorationCommand.run(ctx, {
          itemId: input.itemId,
          kind: CROP_OFFSET_UNIT_KIND,
          attrs: off.ox === 0 && off.oy === 0 ? null : { ox: off.ox, oy: off.oy },
        });
        if (!offsetResult.ok) return offsetResult;
        patches.push(...offsetResult.patches);
      }
      return ok(undefined, patches);
    },
  };

  // WI-074 / DR-029 D7 — toggle a horizontal / vertical flip on ANY supported item.
  // Stored as a kind-agnostic `transform.flip` UNIT (toggled via setDecoration), so
  // the same generic mechanism mirrors image / video / shape / line / frame at
  // NestedFrame. `frame` is a DISPLAY-ONLY flip (children mirrored + non-interactive);
  // qr/text are excluded (scannability / readability).
  const flipItem: Command<FlipItemInput, void> = {
    name: "weave.item.flip",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.item.flip: no item with id "${input.itemId}"`);
      }
      // DR-163 — orchestrate via the flip unit model: the applicability rule
      // (which kinds may flip) and the toggle manipulation live in the unit, not
      // inline here.
      if (!flipUnit.appliesTo(child as unknown as AgocraftItem)) {
        const kind = (child as { kind?: string }).kind ?? "";
        return fail("flip-not-supported", `weave.item.flip: kind "${kind}" cannot be flipped`);
      }
      if (!flipUnit.isAxis(input.axis)) {
        return fail("invalid-input", "weave.item.flip: axis must be 'horizontal' or 'vertical'");
      }
      const next = flipUnit.toggle(flipUnit.read(child as unknown as AgocraftItem), input.axis);
      // The unit decides the persisted attrs (null clears it); the command only
      // emits the patch via the setDecoration kit (single undo).
      return setDecorationCommand.run(ctx, {
        itemId: input.itemId,
        kind: flipUnit.kind,
        attrs: flipUnit.toAttrs(next),
      });
    },
  };

  // WI-056 → DR-028 → DR-161 → DR-163 — set a fill (PaintSpec). `decoration.fill`
  // is a kind-agnostic UNIT; the PaintSpec validation lives in `fillUnit` and the
  // emit in the `emitUnit` wrapper, so this typed, agent-discoverable command is a
  // ONE-LINE factory call with zero hand-written boilerplate.
  const setShapeFill = makeSetUnitCommand<SetShapeFillInput>(
    "weave.shape.setFill",
    fillUnit,
    (input) => input.fill as Readonly<Record<string, unknown>>,
  );

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
      readonly frame: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
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
      // WI-250 — this inline reflow is engine-tagged `derived`, so the central
      // effect runner sees this command as self-reflowed and SUPPRESSES the
      // relayout effect (no double-apply); keeping it inline preserves this path's
      // any-frame-change (incl. move) relayout policy (HANDOFF-003 blocker 1).
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

  // WI-064 — shared align/distribute → frame-patch helper. Same-parent invariant
  // (mirrors the UI's `multiSameParent` gate); used by `weave.items.update`'s
  // `op`. Returns a discriminated result so the caller maps it to ok()/fail().
  const alignPatches = (
    ctx: CommandContext,
    itemIds: ReadonlyArray<string>,
    op: AlignOp,
  ):
    | { readonly ok: true; readonly patches: ReadonlyArray<Patch> }
    | {
        readonly ok: false;
        readonly code: string;
        readonly message: string;
      } => {
    if (!ALIGN_OPS_ORDER.includes(op)) {
      return {
        ok: false,
        code: "invalid-input",
        message: `unknown op "${op}" (one of ${ALIGN_OPS_ORDER.join(", ")})`,
      };
    }
    const ids = itemIds ?? [];
    if (ids.length < 2) {
      return {
        ok: false,
        code: "invalid-input",
        message: "align/distribute needs at least 2 itemIds",
      };
    }
    const rootId = String(ctx.document.root.id);
    let parentId: string | undefined;
    const inputs: AlignInput[] = [];
    for (const id of ids) {
      const item = findChild(ctx.document, id);
      if (item === undefined)
        return { ok: false, code: "item-not-found", message: `no item with id "${id}"` };
      const pi = findParentAndIndex(ctx.document, id);
      const pid = pi === undefined ? rootId : String(pi.parent.id);
      if (parentId === undefined) parentId = pid;
      else if (parentId !== pid) {
        return {
          ok: false,
          code: "cross-parent-selection",
          message:
            "all itemIds must share one parent frame (aligns within a single coordinate space)",
        };
      }
      const f = (item.attrs as { frame?: ItemFrame }).frame;
      if (f === undefined) continue; // non-spatial item — nothing to align
      inputs.push({
        id,
        frame: { x: f.x, y: f.y, width: f.width, height: f.height, rotation: f.rotation },
      });
    }
    if (inputs.length < 2) {
      return {
        ok: false,
        code: "invalid-input",
        message: "fewer than 2 of the itemIds have a frame to align",
      };
    }
    const out = computeAlignedFrames(inputs, op);
    // Emit only items whose frame actually moved (clean history; FP-drift guard).
    const updates = out.flatMap((o, i) => {
      const prev = nn(inputs[i]).frame;
      const moved =
        Math.abs(prev.x - o.frame.x) > 1e-9 ||
        Math.abs(prev.y - o.frame.y) > 1e-9 ||
        Math.abs(prev.width - o.frame.width) > 1e-9 ||
        Math.abs(prev.height - o.frame.height) > 1e-9;
      return moved
        ? [
            {
              itemId: o.id,
              frame: { x: o.frame.x, y: o.frame.y, width: o.frame.width, height: o.frame.height },
            },
          ]
        : [];
    });
    return { ok: true, patches: frameUpdatesToPatches(ctx, updates) };
  };

  // WI-061/063/064 — the ONE multi-selection EDIT command. Absorbs the former
  // weave.items.update + weave.items.align + weave.items.resizeMulti so the agent
  // has a single "modify these items" verb. Any combination of:
  //   • attrs   — shared attrs merged over EACH itemId (shape subAttrs normalized)
  //   • units   — shared decoration units set on EACH itemId (fill/shadow/…/null clears)
  //   • updates — per-item explicit frames [{ itemId, frame }]
  //   • op      — align/distribute across itemIds (same-parent, 8 ops)
  // All emitted from ONE run → one transaction → one Cmd+Z. (The UI keeps using
  // weave.items.resizeMulti directly; that command stays registered.)
  const itemsUpdateInput = (input: {
    readonly itemIds?: ReadonlyArray<string>;
    readonly attrs?: Readonly<Record<string, unknown>>;
    readonly units?: ReadonlyArray<{
      readonly kind: string;
      readonly attrs?: Readonly<Record<string, unknown>> | null;
    }>;
    readonly updates?: ReadonlyArray<{
      readonly itemId: string;
      readonly frame: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
    }>;
    readonly op?: AlignOp;
  }) => input;
  type ItemsUpdateInput = ReturnType<typeof itemsUpdateInput>;

  const itemsUpdate: Command<ItemsUpdateInput, void> = {
    name: "weave.items.update",
    run: (ctx, input) => {
      const ids = input.itemIds ?? [];
      const hasAttrs = input.attrs !== undefined;
      const hasUnits = input.units !== undefined && input.units.length > 0;
      const hasUpdates = input.updates !== undefined && input.updates.length > 0;
      const hasOp = input.op !== undefined;
      if (!hasAttrs && !hasUnits && !hasUpdates && !hasOp) {
        return fail(
          "invalid-input",
          "weave.items.update: provide `attrs`, `units`, `updates`, or `op`",
        );
      }
      if ((hasAttrs || hasUnits) && ids.length === 0) {
        return fail(
          "invalid-input",
          "weave.items.update: `itemIds` is required for `attrs` / `units`",
        );
      }
      const patches: Patch[] = [];

      // shared attrs → each item (shape subAttrs normalized, like weave.item.update)
      if (hasAttrs) {
        for (const id of ids) {
          const child = findChild(ctx.document, id);
          if (child === undefined) {
            return fail("item-not-found", `weave.items.update: no item with id "${id}"`);
          }
          const prevAttrs = child.attrs as Readonly<Record<string, unknown>>;
          const mergedRaw: Readonly<Record<string, unknown>> = { ...prevAttrs, ...input.attrs };
          // DR-082 — same per-kind safety as weave.item.add: shape keeps subAttrs
          // geometry complete; text re-tags a px font mis-declared as a ratio.
          // Registry lookup, not a `kind ===` ternary chain (Rule 6).
          const after = normalizeAttrsForKind(child.kind, mergedRaw);
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
          // WI-250 — inline engine reflow (engine-tagged `derived`) ⇒ the central
          // runner treats items.update as self-reflowed and suppresses relayout
          // (no double); keeping it inline preserves the any-change policy.
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
      }

      // shared decoration units → each item (reuse setDecoration; null clears)
      if (hasUnits) {
        for (const id of ids) {
          for (const u of input.units ?? []) {
            const r = emitUnit(ctx, "weave.items.update", id, u.kind, u.attrs ?? null);
            if (!r.ok) return r;
            patches.push(...r.patches);
          }
        }
      }

      // per-item explicit frames (was weave.items.resizeMulti)
      if (hasUpdates) patches.push(...frameUpdatesToPatches(ctx, input.updates ?? []));

      // align / distribute across the selection (was weave.items.align)
      if (hasOp && input.op !== undefined) {
        const r = alignPatches(ctx, ids, input.op);
        if (!r.ok) return fail(r.code, `weave.items.update: ${r.message}`);
        patches.push(...r.patches);
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

  // ─── WI-077 Phase 1 — dataset 데이터 스토어 commands (DR-031) ──────────
  //
  // A dataset is the data SOURCE a `chart` item references by id. It is NOT a
  // DomainKind item — it lives as a Unit on the document ROOT (`doc.root`),
  // off-canvas, exactly like the `style.provider` Unit. The three commands
  // emit the same self-contained unit patches the behavior commands use
  // (`unit.create` / `unit.attrs` / `unit.remove`), targeting `root.id`;
  // agocraft's `applyPatch` matches the root via `mapItemDeep`, so root-unit
  // ops behave identically to item-unit ops. All three are undoable.

  const addDataset: Command<
    { readonly id?: string; readonly dataset?: Partial<DatasetPayload> },
    string
  > = {
    name: "weave.dataset.add",
    run: (ctx, input) => {
      const root = ctx.document.root;
      const id = input.id ?? nextDatasetId();
      if (findDatasetUnit(ctx.document, id) !== undefined) {
        return fail("duplicate-id", `weave.dataset.add: dataset "${id}" already exists`);
      }
      const payload = normalizeDatasetPayload(input.dataset);
      const unit = buildDatasetUnit(id, payload);
      // Self-contained unit.create (carries the Unit body); inverse =
      // unit.remove. Position appends to root.units.
      const patch: Patch = {
        type: "unit.create",
        itemId: root.id,
        position: root.units.length,
        unit: serializeUnitSubtree(unit),
      };
      return ok(id, [patch]);
    },
  };

  const updateDataset: Command<
    {
      readonly id: string;
      readonly dataset?: Partial<DatasetPayload>;
      readonly patch?: (prev: DatasetPayload) => DatasetPayload;
    },
    void
  > = {
    name: "weave.dataset.update",
    run: (ctx, input) => {
      const found = findDatasetUnit(ctx.document, input.id);
      if (found === undefined) {
        return fail("dataset-not-found", `weave.dataset.update: no dataset "${input.id}"`);
      }
      const before = readDatasetPayload(found.unit);
      if (before === undefined) {
        return fail(
          "missing-dataset",
          `weave.dataset.update: unit "${input.id}" carries no dataset payload`,
        );
      }
      if (input.patch === undefined && input.dataset === undefined) {
        return fail("invalid-input", "weave.dataset.update: provide `patch` or `dataset`");
      }
      // `patch` (UI table edits) or `dataset` (declarative, agent: shallow-merge).
      // WI-172 — normalize the merged result so an agent-sent `dataset` of an
      // illegal shape (rows non-array / null rows / object cells) is coerced
      // here instead of landing in the document and crashing the chart layer.
      const after = input.patch
        ? input.patch(before)
        : normalizeDatasetPayload({ ...before, ...(input.dataset ?? {}) } as DatasetPayload);
      // Single `unit.attrs` patch on path ["dataset"] replaces the whole
      // payload atomically — symmetric with weave.behavior.update's
      // path ["behavior"]. Referencing charts re-render off the new snapshot.
      const patch: Patch = {
        type: "unit.attrs",
        itemId: ctx.document.root.id,
        unitId: makeUnitId(input.id),
        unitKind: found.unit.kind,
        path: ["dataset"],
        before,
        after,
      };
      return ok(undefined, [patch]);
    },
  };

  const removeDataset: Command<{ readonly id: string }, void> = {
    name: "weave.dataset.remove",
    run: (ctx, input) => {
      const found = findDatasetUnit(ctx.document, input.id);
      if (found === undefined) {
        return fail("dataset-not-found", `weave.dataset.remove: no dataset "${input.id}"`);
      }
      // Self-contained unit.remove (carries the Unit so its inverse,
      // unit.create, restores it on undo). Charts referencing this id render a
      // placeholder once it's gone (graceful dangling ref — DR-031).
      const patch: Patch = {
        type: "unit.remove",
        itemId: ctx.document.root.id,
        position: found.index,
        unit: serializeUnitSubtree(found.unit),
      };
      return ok(undefined, [patch]);
    },
  };

  // WI-077 Phase 4 — one-transaction chart creation: seed a dataset on the
  // root-unit store AND create the chart that references it, in a single
  // undoable transaction (one Cmd+Z removes both). Serves both the add-menu
  // and the agent (datasetId-less chart create → auto-seeded data). The chart
  // item.create reuses the same seed/serialize path as weave.item.add; the
  // dataset unit.create mirrors weave.dataset.add.
  const addChart: Command<
    {
      readonly containerId?: string;
      readonly frame?: ItemFrame;
      readonly dataset?: Partial<DatasetPayload>;
      readonly chartType?: ChartType;
      /** Optional explicit channel encoding. REQUIRED for non-category/value
       *  types (scatter/bubble → x/y[/size], heatmap → x/y/value, candlestick →
       *  OHLC, boxplot → 5-number, treemap → id/parent, sankey → source/target).
       *  When omitted, derived as category = first column, value = the rest. */
      readonly encoding?: ChartEncoding;
      /** Presentation variant flags (stacked / normalized / horizontal / smooth /
       *  innerRadius for a doughnut). */
      readonly variant?: ChartVariant;
    },
    string
  > = {
    name: "weave.chart.add",
    run: (ctx, input) => {
      const container = findContainer(ctx.document, input.containerId);
      if (container === undefined) {
        return fail(
          "container-not-found",
          `weave.chart.add: container ${input.containerId} not in doc`,
        );
      }
      const root = ctx.document.root;
      const datasetId = nextDatasetId();
      const payload = normalizeDatasetPayload(input.dataset ?? SAMPLE_CHART_DATASET);
      const datasetPatch: Patch = {
        type: "unit.create",
        itemId: root.id,
        position: root.units.length,
        unit: serializeUnitSubtree(buildDatasetUnit(datasetId, payload)),
      };

      // DR-036 — derive the channel encoding from the seeded columns: first
      // column = category (key axis), remaining columns = value series. An
      // explicit `input.encoding` wins (REQUIRED for non-category/value types
      // like scatter/heatmap/candlestick/treemap/sankey).
      const categoryName = payload.columns[0]?.name;
      const valueNames = payload.columns.slice(1).map((c) => c.name);
      const encoding: ChartEncoding = input.encoding ?? {
        ...(categoryName !== undefined ? { category: { field: categoryName } } : {}),
        ...(valueNames.length > 0 ? { value: valueNames.map((field) => ({ field })) } : {}),
      };
      let chart = createDefaultItem("chart", container.children.length);
      chart = {
        ...chart,
        attrs: {
          ...chart.attrs,
          datasetId,
          chartType: input.chartType ?? "bar",
          encoding,
          ...(input.variant !== undefined ? { variant: input.variant } : {}),
          ...(input.frame !== undefined ? { frame: input.frame } : {}),
        } as typeof chart.attrs,
      };
      const ts = new Date().toISOString();
      const chartPatch: Patch = {
        type: "item.create",
        parentId: container.id,
        position: container.children.length,
        item: serializeItemSubtree(toAgocraftItem(chart, ts)),
      };
      // Order: dataset first (the chart's ref resolves immediately on apply).
      return ok(chart.id, [datasetPatch, chartPatch]);
    },
  };

  // ─── WI-029 — design-level commands via HANDOFF-007 patch variants ────
  //
  // These produce real Patches (`document.attrs` / `item.children.reorder`)
  // so Cmd+Z works on design-level mutations. The host's `applyChange`
  // reducer applies the patch to `design.document.attrs` and child-order.
  //
  // WI-156 / DR-112 — the session-mutable design-level fields (`background`,
  // `presentationOrder`) ALREADY flow as `document.attrs` patches here, and
  // `use-design.ts`'s applyChange mirror reflects them onto the wrapper for
  // legacy readers. The remaining envelope fields (`title`, `width`, `height`)
  // have no in-session mutation surface (no rename / canvas-resize UI), so they
  // ride the initial snapshot and need no patch — the earlier "fold into
  // document.attrs in a follow-up PR" note is moot. A future rename/resize
  // feature must add its own `document.attrs`-emitting command at that time.

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
  const baseReparentItem = createReparentCommand({
    name: "weave.item.reparent",
    computeFrameRatio: computeReparentFrameRatio,
    onReparentLayout: (args) => (LAYOUT_FEATURE_ENABLED ? getLayoutEngine().onReparent(args) : []),
  });
  // WI-135 / DR-086 — universal ratio-font preservation. The kit command keeps
  // the BOX but a `fontSizeSpec.kind:'ratio'` resolves to value × parentHeight,
  // so a reparent into a different-height parent would rescale the glyphs. Wrap
  // the command (covers EVERY caller — UI gesture, Aku agent tool path,
  // programmatic exec) to append `item.attrs` patches that re-base the value in
  // the SAME transaction, so the rendered px is preserved and one Cmd+Z reverts.
  const reparentItem: Command<
    { entries: ReadonlyArray<{ itemId: string; newParentId: string }> },
    void
  > = {
    name: "weave.item.reparent",
    run(ctx, input) {
      const base = baseReparentItem.run(ctx, input as never);
      if (!base.ok || base.patches.length === 0) return base;
      const fontPatches = ratioFontReparentPatches(ctx.document, input.entries, base.patches);
      // WI-051 follow-up — content-hug each reparented TEXT so its box keeps its
      // content size (no ratio-shrink / cross-stretch). Flag-gated → off = no-op.
      const dims = getDesignDims();
      const hugPatches = reparentTextHugPatches(
        ctx.document,
        input.entries,
        base.patches,
        dims?.w,
        dims?.h,
      ) as typeof base.patches;
      const extra = [...fontPatches, ...hugPatches];
      return extra.length === 0 ? base : ok(base.value, [...base.patches, ...extra]);
    },
  };

  // WI-057 — set freeform polygon vertices (agocraft kit command, registered
  // under weave's vocabulary). All item mutation goes through a command.
  const setPolyVertices = createSetPolyPointsCommand("weave.shape.setVertices");

  // WI-065 / DR-031 — shape ↔ line KIND conversion (agocraft kit commands).
  //   • weave.shape.breakToLine — open a closed shape at a vertex → `line`.
  //   • weave.line.closeToShape — fuse a free line/curve's endpoints → filled
  //     `poly` shape.
  // Both are a single-transaction [item.remove, item.create] with a FRESH id
  // (the kit owns the patch assembly + paint migration); the surface re-selects
  // the returned new id.
  const breakShapeToLine = createBreakShapeToLineCommand("weave.shape.breakToLine");
  const closeLineToShape = createCloseLineToShapeCommand("weave.line.closeToShape");

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
  const baseRemoveFrameKeepingChildren = createDissolveFrameCommand({
    name: "weave.frame.removeKeepingChildren",
    computeFrameRatio: computeReparentFrameRatio,
  });
  // WI-135 — dissolve lifts the frame's children into its OWN parent, so a
  // ratio-font child moving to a different-height parent would rescale (same as
  // a reparent). Wrap it to re-base each lifted child's ratio fontSize in the
  // same transaction (no-op when heights match / no ratio text).
  const removeFrameKeepingChildren: Command<{ frameId: string }, void> = {
    name: "weave.frame.removeKeepingChildren",
    run(ctx, input) {
      const base = baseRemoveFrameKeepingChildren.run(ctx, input as never);
      if (!base.ok || base.patches.length === 0) return base;
      const frame = findItemDeep(ctx.document, input.frameId);
      const parentInfo = findParentAndIndex(ctx.document, input.frameId);
      const newParentId =
        parentInfo !== undefined ? String(parentInfo.parent.id) : String(ctx.document.root.id);
      const entries = (frame?.children ?? []).map((c) => ({
        itemId: String(c.id),
        newParentId,
      }));
      const fontPatches = ratioFontReparentPatches(ctx.document, entries, base.patches);
      const dims = getDesignDims();
      const hugPatches = reparentTextHugPatches(
        ctx.document,
        entries,
        base.patches,
        dims?.w,
        dims?.h,
      ) as typeof base.patches;
      const extra = [...fontPatches, ...hugPatches];
      return extra.length === 0 ? base : ok(base.value, [...base.patches, ...extra]);
    },
  };

  // ─── WI-185 ⑭ / WI-242 A2 — Cmd+G: wrap the selection in a NEW group ──────
  //
  // The grouping construct is now the dedicated `group` kind (DR-159) — a
  // transparent container with the ≥2-children / dissolve-on-underflow
  // invariant — NOT a frame (a frame is a layout surface / slide; a group is a
  // pure composition wrapper). "group" = create a `group` over the selection's
  // bounding box and reparent the members into it. Composite via delegate-run +
  // an EVOLVED working doc (the weave.batch idiom): the wrap group must exist in
  // the document the reparent geometry reads (computeReparentFrameRatio resolves
  // the new parent there), so the create patches are applied to a working copy
  // before reparentItem runs. Delegating to the real commands buys every guard
  // for free — id minting + frame normalization (weave.item.add), visual-
  // position preserving reparent + WI-135 ratio-font re-basing
  // (weave.item.reparent). One transaction → one Cmd+Z unwraps (children home,
  // group gone). Ungroup (Cmd+Shift+G) dissolves it via removeKeepingChildren,
  // and the A3 invariant auto-dissolves it when it underflows to <2 children.
  //
  // The bbox unions the members' UNROTATED parent-ratio boxes — a rotated
  // member's visual corners may overhang the wrap group slightly (groups
  // don't clip, so nothing disappears); matching office tools' rotated-bbox
  // math is deliberately out of scope here.
  const groupItems: Command<
    {
      readonly itemIds: ReadonlyArray<string>;
      readonly designWidth?: number;
      readonly designHeight?: number;
    },
    string
  > = {
    name: "weave.items.group",
    run: (ctx, input) => {
      if (input.itemIds.length === 0) {
        return fail("empty-input", "weave.items.group: no items given");
      }
      // A group wraps SIBLINGS: all members must share one parent. (An
      // ancestor/descendant pair can never share a parent, so this also
      // rules out nesting paradoxes.) Validate ALL upfront.
      let parentId: string | undefined;
      const frames: ItemFrame[] = [];
      for (const id of input.itemIds) {
        const found = findParentAndIndex(ctx.document, id);
        if (found === undefined) {
          return fail("item-not-found", `weave.items.group: no item "${id}"`);
        }
        const pid = String(found.parent.id);
        if (parentId === undefined) parentId = pid;
        else if (pid !== parentId) {
          return fail(
            "mixed-parents",
            "weave.items.group: items must share one parent (group wraps siblings)",
          );
        }
        const frame = (
          found.parent.children[found.indexInParent]?.attrs as { frame?: ItemFrame } | undefined
        )?.frame;
        if (frame === undefined) {
          return fail("invalid-target", `weave.items.group: "${id}" has no frame`);
        }
        frames.push(frame);
      }
      const minX = Math.min(...frames.map((f) => f.x));
      const minY = Math.min(...frames.map((f) => f.y));
      const maxX = Math.max(...frames.map((f) => f.x + f.width));
      const maxY = Math.max(...frames.map((f) => f.y + f.height));
      const groupFrame: ItemFrame = {
        x: minX,
        y: minY,
        // Floor against a degenerate bbox (zero-area lines) — a zero-size
        // frame would be unselectable (DR-078's concern, applied here).
        width: Math.max(maxX - minX, 0.01),
        height: Math.max(maxY - minY, 0.01),
        rotation: 0,
      };
      const created = addItem.run(ctx, {
        kind: "group",
        frame: groupFrame,
        containerId: nn(parentId), // non-empty itemIds → the loop set it
      });
      if (!created.ok) return created;
      let workingDoc = ctx.document;
      for (const p of created.patches) {
        workingDoc = applyChangeToDocument(
          workingDoc,
          p as unknown as Parameters<typeof applyChangeToDocument>[1],
        );
      }
      const groupId = String(created.value);
      const rep = reparentItem.run({ ...ctx, document: workingDoc }, {
        entries: input.itemIds.map((id) => ({ itemId: id, newParentId: groupId })),
        ...(input.designWidth !== undefined ? { designWidth: input.designWidth } : {}),
        ...(input.designHeight !== undefined ? { designHeight: input.designHeight } : {}),
      } as never);
      if (!rep.ok) return rep;
      return ok(groupId, [...created.patches, ...rep.patches]);
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
      // WI-185 ⑫ — the kit's `pointerInContainer` is an opaque host channel
      // (typed `unknown`); page-bounded hosts pass the office-contract
      // descriptor through it instead of a pointer. Discriminate by shape.
      const p = a.pointerInContainer;
      if (isOfficePasteHint(p)) {
        return resolvePasteFrame({
          ...base,
          officeContract: { sameContainer: p.sameContainer },
        });
      }
      return p !== undefined
        ? resolvePasteFrame({
            ...base,
            pointerInContainer: p as NonNullable<PasteCoordInput["pointerInContainer"]>,
          })
        : resolvePasteFrame(base);
    },
    pasteSpecial: PASTE_SPECIAL_HANDLERS as Readonly<Record<string, StyleHandler>>,
  });

  // WI-224 — paste must honor the DESTINATION layout's add-rule. The @agocraft
  // core clipboard kit appends every pasted item at the container's end with a
  // stacking / pointer FRAME — right for an absolute / no-layout canvas, but
  // inside a flex / grid parent that frame OVERLAPS the existing cells: the item
  // only snaps into a real cell when the container frame is later MOVED and the
  // engine reflows (the reported bug). This decorator routes each pasted item
  // through the SAME layout placement `weave.item.add` uses
  // (`getLayoutEngine().onChildAdd`): grid → the next FREE cell (a full grid
  // grows its tracks via `growToFit`, so the paste never stacks on the last
  // cell), flex → the next slot (sized by distribute). Absolute / no-layout /
  // root → the kit's free placement stands, unchanged. All patches ride the kit's
  // one transaction → one Cmd+Z. Mirrors the `removeItems` kit-decorator pattern.
  const clipboardPastePlaced: typeof clipboardPaste =
    clipboardPaste === undefined
      ? undefined
      : {
          name: clipboardPaste.name,
          run: (ctx, input) => {
            const result = clipboardPaste.run(ctx, input);
            // paste-special modes (style/text/size/…) emit attr patches, not
            // item.create — nothing to place. Same for a failed paste.
            if (!result.ok || !LAYOUT_FEATURE_ENABLED) return result;
            const containerId = input.containerId;
            if (containerId === undefined || containerId === String(ctx.document.root.id)) {
              return result; // root canvas → free placement (kit stands)
            }
            const container = findItemDeep(ctx.document, containerId);
            if (container === undefined) return result;
            const layout = normalizeLayoutSpec((container.attrs as { layout?: LayoutSpec }).layout);
            if (
              layout === undefined ||
              (layout.kind !== "auto-flex" && layout.kind !== "auto-grid")
            ) {
              return result; // absolute / no layout → free placement (kit stands)
            }
            const engine = getLayoutEngine();
            // Thread a synthetic parent whose children + (grown) layout accumulate
            // across the batch, so each pasted item is placed against the PRIOR
            // placements — one free cell / slot per item, never the same twice.
            let pendingChildren: AgocraftItem[] = [...container.children];
            let effLayout: LayoutSpec = layout;
            const layoutExtra: Patch[] = [];
            const placed = result.patches.map((p): Patch => {
              if (p.type !== "item.create" || String(p.parentId) !== String(container.id)) {
                return p;
              }
              const syntheticParent: AgocraftItem = {
                ...container,
                attrs: { ...container.attrs, layout: effLayout } as AgocraftItem["attrs"],
                children: pendingChildren,
              };
              // Strip the SOURCE's per-child policy: a copied item carries the
              // cell / slot of the item it was copied from, and onChildAdd keeps
              // a same-paradigm policy as-is — which would place the paste back on
              // the source's cell (overlap). Clearing it makes onChildAdd assign a
              // FRESH placement (grid → next free cell, flex → default slot).
              const srcItem = p.item as unknown as AgocraftItem;
              let newChild: AgocraftItem = {
                ...srcItem,
                attrs: { ...srcItem.attrs, layoutChild: undefined } as AgocraftItem["attrs"],
              };
              // WI-051 follow-up — a pasted TEXT's basis:"auto" reads its CURRENT
              // (source / root-add) frame size, so the flex first places it at that
              // size, then reflows to fit → a visible two-step. MEASURE the text now
              // (model computes it) so its frame is its CONTENT size before onChildAdd
              // → the flex places it correctly in ONE step. Flag-off ⇒ unchanged.
              // DR-157 — the SINGLE shared measure (same as add + reparent).
              const dims = getDesignDims();
              if (dims !== undefined && srcItem.kind === "text") {
                const cbox = absoluteFrameBox(ctx.document, String(container.id), dims.w, dims.h);
                const at = srcItem.attrs as Record<string, unknown>;
                const srcFrame = at.frame as AgocraftItemFrame | undefined;
                const hug =
                  cbox !== null && srcFrame !== undefined
                    ? textHugFrameRatio(at, cbox, cbox.h)
                    : undefined;
                if (srcFrame !== undefined && hug !== undefined) {
                  newChild = {
                    ...newChild,
                    attrs: {
                      ...newChild.attrs,
                      frame: { ...srcFrame, width: hug.width, height: hug.height },
                    } as AgocraftItem["attrs"],
                  };
                }
              }
              const res = engine.onChildAdd({
                parent: syntheticParent,
                newChild,
                // paste into a FULL auto-grid grows its tracks so the item lands
                // in its own cell instead of stacking onto the last one.
                growToFit: true,
              });
              layoutExtra.push(...res.siblingPatches);
              if (res.parentPatch !== undefined) {
                layoutExtra.push(res.parentPatch);
                effLayout = (res.parentPatch as { after: LayoutSpec }).after;
              }
              // DR-157 — stamp the SHARED hug policy on a placed TEXT so paste matches
              // add + reparent (content-hug `basis:"auto"`, not the engine-derived
              // frozen basis). Grid → undefined (cell + render font shrink-to-fit).
              let stagedChild = res.stagedChild as AgocraftItem;
              if (srcItem.kind === "text") {
                const policy = textHugChildPolicy(layout.kind);
                if (policy !== undefined) {
                  stagedChild = {
                    ...stagedChild,
                    attrs: { ...stagedChild.attrs, layoutChild: policy } as AgocraftItem["attrs"],
                  };
                }
              }
              pendingChildren = [...pendingChildren, stagedChild];
              // `stagedChild` is the kit's SerializedItem with only its frame +
              // layoutChild re-stamped by the engine → reuse it as the create item.
              return { ...p, item: stagedChild as unknown as typeof p.item };
            });
            return ok(result.value, [...placed, ...layoutExtra]);
          },
        };

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
  // WI-183 — Alt-drag duplicate. Same kit, `offset: 0` (the weave.page.
  // duplicate idiom): the copy must hold the source's exact frame because the
  // ORIGINAL is the thing the gesture keeps moving — a nudged copy would read
  // as a ghost jump at the drag threshold. Separate registration (not a flag
  // on weave.items.duplicate) because the offset is factory-level in the kit.
  const duplicateItemsInPlace = createDuplicateItemsCommand({
    name: "weave.items.duplicateInPlace",
    maxNodes: MAX_PASTE_NODES,
    offset: 0,
  });

  // WI-185 ⑬ — smart duplicate (Cmd+D delta repeat). The kit's duplicate
  // offset is FACTORY-level (no per-call delta), so the office "duplicate →
  // move the copy → duplicate again continues the rhythm" gesture needs a
  // composite: kit clone at `offset: 0` via delegate-`run` (the weave.page.
  // duplicate idiom), then ONE item.attrs translate patch per clone root.
  // `before: source.attrs` is exact because an offset-0 clone's attrs ARE the
  // source's attrs; patches apply sequentially within the transaction, so the
  // translate lands after the clone's item.create. One transaction → one
  // Cmd+Z rolls back clone + translate together. `dx`/`dy` are PARENT-RATIO
  // deltas (the frame's own coordinate space) — the host measures
  // clone.frame − source.frame in that same space.
  const duplicateItemsWithDeltaClone = createDuplicateItemsCommand({
    name: "weave.items.duplicateWithDelta",
    maxNodes: MAX_PASTE_NODES,
    offset: 0,
  });
  const duplicateItemsWithDelta: Command<
    { readonly itemIds: ReadonlyArray<string>; readonly dx: number; readonly dy: number },
    ReadonlyArray<string>
  > = {
    name: "weave.items.duplicateWithDelta",
    run: (ctx, input) => {
      if (input.itemIds.length === 0) {
        return fail("empty-input", "weave.items.duplicateWithDelta: no items given");
      }
      if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) {
        return fail("invalid-input", "weave.items.duplicateWithDelta: dx/dy must be finite");
      }
      // Validate ALL upfront (the kit silently skips missing ids, which would
      // desync the source→clone index alignment below — same guard as
      // weave.pages.duplicate).
      const sources: AgocraftItem[] = [];
      for (const id of input.itemIds) {
        const source = findItemDeep(ctx.document, id);
        if (source === undefined) {
          return fail("item-not-found", `weave.items.duplicateWithDelta: no item "${id}"`);
        }
        sources.push(source);
      }
      const r = duplicateItemsWithDeltaClone.run(ctx, { itemIds: input.itemIds });
      if (!r.ok) return r;
      const translatePatches: Patch[] = [];
      r.value.forEach((cloneId, i) => {
        const source = sources[i];
        if (cloneId === undefined || source === undefined) return;
        const attrs = source.attrs as unknown as Readonly<Record<string, unknown>>;
        const frame = (attrs as { frame?: AgocraftItemFrame }).frame;
        if (frame === undefined) return; // frameless item — clone lands in place
        translatePatches.push({
          type: "item.attrs",
          itemId: makeItemId(cloneId),
          before: source.attrs,
          after: {
            ...attrs,
            frame: { ...frame, x: frame.x + input.dx, y: frame.y + input.dy },
          } as unknown as typeof source.attrs,
        });
      });
      return ok(r.value, [...r.patches, ...translatePatches]);
    },
  };

  // WI-155 — page duplicate (WI-153 P2.3 보류분). Same kit clone, two page-
  // specific differences vs weave.item.duplicate:
  //   1. `offset: 0` — the default 0.02 nudge exists so an in-place copy is
  //      visibly distinct on an infinite canvas; on a page it knocks a
  //      FULL_FRAME clone out of the page box. A page clone must land exactly
  //      on the source's frame (the rail/active-page switch IS the affordance).
  //   2. The SAME transaction also inserts the clone into `presentationOrder`
  //      right after the source — reconcile's default would append it at the
  //      END of the rail. Composite via delegate-`run` (the weave.items.
  //      lifecycle idiom): the kit's new id is in hand before patches are
  //      sealed, which `weave.batch` cannot do (mid-batch ids unaddressable).
  // One transaction → one Cmd+Z rolls back clone + order together.
  const pageDuplicateClone = createDuplicateItemCommand({
    name: "weave.page.duplicate",
    maxNodes: MAX_PASTE_NODES,
    offset: 0,
  });
  const pageDuplicate: Command<{ readonly itemId: string }, string> = {
    name: "weave.page.duplicate",
    run: (ctx, input) => {
      // Page semantics guarded by the command, not the caller: only frames
      // are pages. Non-frame items go through weave.item.duplicate.
      const source = findItemDeep(ctx.document, input.itemId);
      if (source === undefined) {
        return fail("item-not-found", `weave.page.duplicate: no item "${input.itemId}"`);
      }
      if (!FRAME_KINDS.has(source.kind)) {
        return fail(
          "not-a-page",
          `weave.page.duplicate: "${input.itemId}" is a ${source.kind}, not a frame`,
        );
      }
      const r = pageDuplicateClone.run(ctx, input);
      if (!r.ok) return r;
      // Insert the clone right after the source in the EFFECTIVE order (the
      // saved array may lag the tree; reconcile against it first). A source
      // outside the deck (presentable:false group) is absent from the order —
      // its clone inherits the flag and stays out too, so skip the patch.
      const before = (ctx.document.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const saved = Array.isArray(before.presentationOrder)
        ? (before.presentationOrder as ReadonlyArray<string>)
        : [];
      const effective = reconcilePresentationOrder(
        saved,
        collectPresentationIds(ctx.document.root),
      );
      const at = effective.indexOf(input.itemId);
      if (at < 0) return r;
      const order = [...effective.slice(0, at + 1), r.value, ...effective.slice(at + 1)];
      const orderPatch: Patch = {
        type: "document.attrs",
        before,
        after: { ...before, presentationOrder: order },
      };
      return ok(r.value, [...r.patches, orderPatch]);
    },
  };

  // WI-184 ⑨ — SET duplicate for rail multi-select. One kit batch clone
  // (offset 0, same page semantics as weave.page.duplicate) + ONE order patch
  // interleaving each clone right after its source — one transaction → one
  // Cmd+Z rolls the whole set back. Not a host-side loop over
  // weave.page.duplicate: that would be N transactions → N undo steps for one
  // user gesture, breaking the History contract.
  const pagesDuplicateClone = createDuplicateItemsCommand({
    name: "weave.pages.duplicate",
    maxNodes: MAX_PASTE_NODES,
    offset: 0,
  });
  const pagesDuplicate: Command<
    { readonly itemIds: ReadonlyArray<string> },
    ReadonlyArray<string>
  > = {
    name: "weave.pages.duplicate",
    run: (ctx, input) => {
      if (input.itemIds.length === 0) {
        return fail("empty-input", "weave.pages.duplicate: no pages given");
      }
      // Page semantics guarded by the command, not the caller: only frames
      // are pages. Validate ALL upfront (the kit silently skips missing ids,
      // which would desync the source→clone index alignment below).
      for (const id of input.itemIds) {
        const source = findItemDeep(ctx.document, id);
        if (source === undefined) {
          return fail("item-not-found", `weave.pages.duplicate: no item "${id}"`);
        }
        if (!FRAME_KINDS.has(source.kind)) {
          return fail(
            "not-a-page",
            `weave.pages.duplicate: "${id}" is a ${source.kind}, not a frame`,
          );
        }
      }
      const r = pagesDuplicateClone.run(ctx, { itemIds: input.itemIds });
      if (!r.ok) return r;
      // Kit returns clone ids in input order (all sources validated present).
      const cloneBySource = new Map<string, string>();
      input.itemIds.forEach((id, i) => {
        const clone = r.value[i];
        if (clone !== undefined) cloneBySource.set(id, clone);
      });
      const before = (ctx.document.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const saved = Array.isArray(before.presentationOrder)
        ? (before.presentationOrder as ReadonlyArray<string>)
        : [];
      const effective = reconcilePresentationOrder(
        saved,
        collectPresentationIds(ctx.document.root),
      );
      // One pass: every deck page keeps its slot; a duplicated page gets its
      // clone spliced right behind it. Sources outside the deck
      // (presentable:false) are absent from `effective` — their clones
      // inherit the flag and stay out too (same rule as weave.page.duplicate).
      const order = effective.flatMap((pid) => {
        const clone = cloneBySource.get(pid);
        return clone !== undefined ? [pid, clone] : [pid];
      });
      if (order.length === effective.length) return r; // no source in the deck
      const orderPatch: Patch = {
        type: "document.attrs",
        before,
        after: { ...before, presentationOrder: order },
      };
      return ok(r.value, [...r.patches, orderPatch]);
    },
  };

  // WI-184 ⑩ — page add as a REAL command (was an agent-surface alias over
  // weave.item.add + a raw item.add at the rail-"+" call site). Two reasons:
  //   1. Insert position: 5/5-tool consensus puts a new slide right AFTER the
  //      current one, not at the deck end. The order splice must ride the SAME
  //      transaction as the create (one Cmd+Z) — only a command can compose
  //      patches, so the call sites can't fix this themselves.
  //   2. WI-169 FULL_FRAME lock: the command stamps kind/container/frame, so
  //      every page-creation path (rail "+", agent tool) shares the page-box
  //      invariant structurally instead of each call site re-stating it.
  // Composite via delegate-`run` (the weave.page.duplicate idiom above).
  // `afterId` omitted/unknown → append at the deck end (legacy behavior, and
  // the degenerate empty-deck case).
  const pageAdd: Command<
    {
      readonly afterId?: string;
      readonly attrsOverride?: Readonly<Record<string, unknown>>;
      readonly units?: ReadonlyArray<{
        readonly kind: string;
        readonly attrs?: Readonly<Record<string, unknown>>;
      }>;
    },
    string
  > = {
    name: "weave.page.add",
    run: (ctx, input) => {
      const r = addItem.run(ctx, {
        kind: "frame",
        // Root container — pages are root-level frames (WI-169).
        frame: FULL_FRAME,
        // exactOptionalPropertyTypes — spread the optionals only when present.
        ...(input.attrsOverride !== undefined ? { attrsOverride: input.attrsOverride } : {}),
        ...(input.units !== undefined ? { units: input.units } : {}),
      });
      if (!r.ok) return r;
      const before = (ctx.document.attrs ?? {}) as Readonly<Record<string, unknown>>;
      const saved = Array.isArray(before.presentationOrder)
        ? (before.presentationOrder as ReadonlyArray<string>)
        : [];
      // ctx.document predates the create (patches apply later), so the new id
      // is spliced in by hand — same shape as weave.page.duplicate above.
      const effective = reconcilePresentationOrder(
        saved,
        collectPresentationIds(ctx.document.root),
      );
      const at = input.afterId === undefined ? -1 : effective.indexOf(input.afterId);
      const order =
        at >= 0
          ? [...effective.slice(0, at + 1), r.value, ...effective.slice(at + 1)]
          : [...effective, r.value];
      const orderPatch: Patch = {
        type: "document.attrs",
        before,
        after: { ...before, presentationOrder: order },
      };
      return ok(r.value, [...r.patches, orderPatch]);
    },
  };

  // WI-064 — the ONE multi-selection LIFECYCLE command. Absorbs the former
  // weave.items.remove + weave.items.duplicate behind a single `op`, so the
  // agent's multi surface is exactly two verbs (items.update = edit, this =
  // structural). Delegates to the kit commands (which stay registered for the
  // UI) so the patch semantics / undo are identical.
  const itemsLifecycleInput = (input: {
    readonly itemIds: ReadonlyArray<string>;
    readonly op: "remove" | "duplicate";
  }) => input;
  type ItemsLifecycleInput = ReturnType<typeof itemsLifecycleInput>;
  const itemsLifecycle: Command<ItemsLifecycleInput, void> = {
    name: "weave.items.lifecycle",
    run: (ctx, input) => {
      const ids = input.itemIds ?? [];
      if (ids.length === 0) {
        return fail("invalid-input", "weave.items.lifecycle: `itemIds` must be non-empty");
      }
      if (input.op !== "remove" && input.op !== "duplicate") {
        return fail("invalid-input", "weave.items.lifecycle: `op` must be 'remove' | 'duplicate'");
      }
      // Delegate to the kit commands (registered for the UI); normalize the
      // result to void (duplicate returns the new ids, which the agent doesn't need).
      const r =
        input.op === "remove"
          ? removeItems.run(ctx, { itemIds: ids })
          : duplicateItems.run(ctx, { itemIds: ids });
      return r.ok ? ok(undefined, r.patches) : r;
    },
  };

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
  // Wrap the kit command so every incoming LayoutSpec is normalized (required
  // padding/gap/tracks filled) before it is stored — the @agocraft/layout engine
  // reads spec.padding.left unguarded, so an agent-supplied spec without padding
  // would otherwise crash the next onChildAdd. See normalizeLayoutSpec.
  const rawSetFrameLayout = createSetFrameLayoutCommand({
    name: "weave.frame.setLayout",
    getEngine: getLayoutEngine,
  });
  const setFrameLayout: Command<SetFrameLayoutInput, void> = {
    ...rawSetFrameLayout,
    run: (ctx, input) => {
      let layout = normalizeLayoutSpec(input.layout);
      // When a frame BECOMES a grid, size the grid to its child count so every
      // child lands in its own cell (min 2×2), non-overlapping. The toolbar's
      // "Grid" pick sends a fresh ≤1×1 default spec — that's the trigger. A
      // deliberately-configured grid (GridSizePicker sends explicit multi-track
      // arrays) is left untouched so track edits aren't clobbered.
      if (layout?.kind === "auto-grid" && layout.columns.length <= 1 && layout.rows.length <= 1) {
        const frame = findChild(ctx.document, String(input.itemId));
        layout = gridSpecForChildCount(frame?.children.length ?? 0, layout);
      }
      // WI-226 — when (re)setting a grid on a frame that ALREADY holds children
      // with AUTHORED cells, GROW the declared tracks to cover those cells. A
      // re-issued setLayout carrying a too-small columns/rows (e.g. the agent
      // re-asserts its original 1-row spec after item.add already grew the grid)
      // would otherwise push authored cells out of bounds → the auto-grid adapter
      // clamps them onto the last cell and the items STACK (the "1-row grid, last
      // column dumping" regression). Coverage keeps the agent's column count.
      if (layout?.kind === "auto-grid") {
        const frame = findChild(ctx.document, String(input.itemId));
        let maxCol = 1;
        let maxRow = 1;
        for (const c of frame?.children ?? []) {
          const p = (
            c.attrs as {
              layoutChild?: {
                kind?: string;
                column?: number;
                row?: number;
                columnSpan?: number;
                rowSpan?: number;
              };
            }
          ).layoutChild;
          if (p === undefined || p.kind !== "auto-grid") continue;
          maxCol = Math.max(maxCol, (p.column ?? 1) + Math.max(1, p.columnSpan ?? 1) - 1);
          maxRow = Math.max(maxRow, (p.row ?? 1) + Math.max(1, p.rowSpan ?? 1) - 1);
        }
        const covered = gridSpecWithMinTracks(layout, maxCol, maxRow);
        if (covered !== undefined) layout = covered;
      }
      // WI-043 P6 — resolve the frame's absolute box so a FIXED-px gap/padding
      // spec lays children at exact px on the paradigm switch (not ratio). Omit
      // ⇒ ratio (no regression for callers that don't pass design dims).
      const hasDims =
        typeof input.designWidth === "number" &&
        typeof input.designHeight === "number" &&
        input.designWidth > 0 &&
        input.designHeight > 0;
      const box = hasDims
        ? absoluteFrameBox(
            ctx.document,
            String(input.itemId),
            input.designWidth as number,
            input.designHeight as number,
          )
        : null;
      const result = rawSetFrameLayout.run(ctx, {
        ...input,
        layout,
        ...(box !== null ? { parentPx: { w: box.w, h: box.h } } : {}),
      });
      if (!result.ok) return result;

      // WI-048 — a HUG container also re-fits its BOX when its layout changes
      // (gap / direction / padding / justify). `onLayoutChange` (above) only
      // re-arranges children in the container's CURRENT box; for a Hug container
      // that box is itself derived from the children, so it must be recomputed.
      // refitHugContainer (staged with the new layout) does the full re-fit +
      // re-arrange; its patches supersede onLayoutChange's child arrangement (the
      // container's layout + new frame fold into one patch for a clean undo).
      const cont = findChild(ctx.document, String(input.itemId));
      const isHugNew =
        layout !== undefined &&
        (layout.kind === "auto-flex" || layout.kind === "auto-grid") &&
        ((layout as { sizing?: AxisSizingPair }).sizing?.width === "hug" ||
          (layout as { sizing?: AxisSizingPair }).sizing?.height === "hug");
      if (LAYOUT_FEATURE_ENABLED && hasDims && cont !== undefined && isHugNew) {
        const refit = refitHugContainer({
          root: mapItemDeep(ctx.document.root, cont.id, (it) => ({
            ...it,
            attrs: { ...it.attrs, layout },
          })),
          containerId: cont.id,
          designWidth: input.designWidth as number,
          designHeight: input.designHeight as number,
          ...measureTextInput(),
        });
        if (refit.length > 0) {
          const cid = String(cont.id);
          const patchItemId = (p: Patch): string | undefined =>
            "itemId" in p ? String((p as { itemId: unknown }).itemId) : undefined;
          const containerRefit = refit.find((p) => patchItemId(p) === cid) as
            | { after: { frame?: ItemFrame } }
            | undefined;
          const desc = refit.filter((p) => patchItemId(p) !== cid);
          const containerPatch: Patch = {
            type: "item.attrs",
            itemId: cont.id,
            before: cont.attrs,
            after: {
              ...cont.attrs,
              layout,
              ...(containerRefit?.after.frame !== undefined
                ? { frame: containerRefit.after.frame }
                : {}),
            },
          } as Patch;
          // WI-250 — self-managed Hug re-fit; stamp the reconstructed container
          // patch `derived` (desc patches are engine-tagged) so the central runner
          // suppresses relayout.
          return ok(undefined, [asReflowDerived(containerPatch), ...desc]);
        }
      }
      return result;
    },
  };
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

  // WI-042 / DR-055 / FR-011 — set a frame's per-axis container sizing
  // (Fixed/Hug/Fill). Requires an auto-flex OR auto-grid layout (P4 — sizing is
  // a container property of both AutoFlexSpec and AutoGridSpec).
  // SIZING_RULES: a Hug axis needs ≥1 child (an empty container can't hug).
  const setFrameSizing: Command<
    {
      readonly itemId: string;
      readonly sizing: AxisSizingPair;
      // WI-047 — design-plane px basis → EXACT re-fit: setting Hug snaps the
      // container to its content NOW (not on the next child resize). Omit ⇒ the
      // sizing attr changes but the box is re-fit only on a later reflow.
      readonly designWidth?: number;
      readonly designHeight?: number;
    },
    void
  > = {
    name: "weave.frame.setSizing",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.frame.setSizing: no item "${input.itemId}"`);
      }
      const layout = (child.attrs as { layout?: LayoutSpec }).layout;
      // WI-042 P4 — sizing is a container property of auto-flex OR auto-grid.
      if (layout === undefined || (layout.kind !== "auto-flex" && layout.kind !== "auto-grid")) {
        return fail(
          "invalid-input",
          "weave.frame.setSizing: target needs an auto-flex / auto-grid layout (sizing is a container property)",
        );
      }
      const hugW = input.sizing.width === "hug";
      const hugH = input.sizing.height === "hug";
      if ((hugW || hugH) && child.children.length === 0) {
        return fail(
          "invalid-input",
          "weave.frame.setSizing: a Hug axis requires at least one child",
        );
      }
      const nextLayout: LayoutSpec = { ...layout, sizing: input.sizing } as LayoutSpec;
      const cid = String(child.id);
      const hasDims =
        typeof input.designWidth === "number" &&
        typeof input.designHeight === "number" &&
        input.designWidth > 0 &&
        input.designHeight > 0;

      // No design basis ⇒ just flip the sizing attr (the box re-fits on the next
      // reflow). px-pin + exact re-fit both need a design basis.
      if (!(LAYOUT_FEATURE_ENABLED && hasDims)) {
        return ok(undefined, [
          {
            type: "item.attrs",
            itemId: child.id,
            before: child.attrs,
            after: { ...child.attrs, layout: nextLayout },
          } as Patch,
        ]);
      }
      const dW = input.designWidth as number;
      const dH = input.designHeight as number;

      // WI-224 — PIN px from the CURRENT geometry (BEFORE a Hug re-fit shrinks the
      // box): each direct child gets a stable `sizePx` + explicit basis/crossSize,
      // the container gets `gapPx`/`paddingPx`. This breaks the ratio↔px
      // circularity that made the container GROW (gap re-derived from its own
      // growing size), SHRINK on move, and drift — the engine reads the pinned px
      // as authoritative. Subsumes the prior hug→fixed basis bake (pin sets an
      // explicit basis from the current frame on every sizing change).
      const pinned = pinAutoLayoutPx(ctx.document, child, nextLayout, dW, dH);

      // Re-fit the Hug box against the PINNED doc (stable px) so the arrange is
      // exact + non-circular.
      const refitPatches = refitHugContainer({
        root: stagePinned(ctx.document.root, child.id, pinned, mapItemDeep),
        containerId: child.id,
        designWidth: dW,
        designHeight: dH,
        ...measureTextInput(),
      });

      const patchItemId = (p: Patch): string | undefined =>
        "itemId" in p ? String((p as { itemId: unknown }).itemId) : undefined;
      const directIds = new Set(child.children.map((c) => String(c.id)));
      const refitFrameOf = new Map<string, ItemFrame>();
      const grandchildPatches: Patch[] = [];
      let containerFrame: ItemFrame | undefined;
      for (const p of refitPatches) {
        const pid = patchItemId(p);
        const frame = (p as { after?: { frame?: ItemFrame } }).after?.frame;
        if (pid === cid) containerFrame = frame;
        else if (pid !== undefined && directIds.has(pid) && frame !== undefined)
          refitFrameOf.set(pid, frame);
        else grandchildPatches.push(p); // nested descendant — staged `before` == original
      }

      // Container: pinned layout (sizing + gap/padding px) + re-fit frame, one
      // patch with `before` == original (clean undo).
      const containerPatch: Patch = {
        type: "item.attrs",
        itemId: child.id,
        before: child.attrs,
        after: {
          ...child.attrs,
          layout: pinned.layout,
          ...(containerFrame !== undefined ? { frame: containerFrame } : {}),
        },
      } as Patch;

      // Each direct child: ONE patch merging its pinned policy + re-fit frame,
      // `before` == original attrs.
      const childPatches: Patch[] = [];
      for (const c of child.children) {
        const pol = pinned.childPolicies.get(String(c.id));
        if (pol === undefined) continue;
        const frame = refitFrameOf.get(String(c.id));
        childPatches.push({
          type: "item.attrs",
          itemId: c.id,
          before: c.attrs,
          after: { ...c.attrs, layoutChild: pol, ...(frame !== undefined ? { frame } : {}) },
        } as Patch);
      }

      // WI-250 — this command fully self-manages its layout (pin + re-fit); stamp
      // its reconstructed patches `derived` so the central runner suppresses
      // relayout (its grandchild patches are already engine-tagged).
      return ok(undefined, [
        asReflowDerived(containerPatch),
        ...childPatches.map(asReflowDerived),
        ...grandchildPatches,
      ]);
    },
  };

  // WI-042 / DR-055 / FR-011 — resize a child by its absolute px intrinsic
  // (option A). Sets the child's `layoutChild.sizePx` and, when it sits inside a
  // Hug container, folds in `reflowHugOnResize` (the Hug ancestor grows + the
  // subtree re-arranges) — all in ONE transaction (one undo). Gated: no Hug
  // ancestor ⇒ only the sizePx is recorded (no layout change → existing path).
  const resizeHug: Command<
    {
      readonly itemId: string;
      readonly sizePx: { readonly w: number; readonly h: number };
      // Design-plane px basis → EXACT Figma hug (root anchored to hug px ÷ parent
      // px). Omit for the proportional cancel-trick fallback.
      readonly designWidth?: number;
      readonly designHeight?: number;
    },
    void
  > = {
    name: "weave.item.resizeHug",
    run: (ctx, input) => {
      const child = findChild(ctx.document, input.itemId);
      if (child === undefined) {
        return fail("item-not-found", `weave.item.resizeHug: no item "${input.itemId}"`);
      }
      // WI-042 P4 — preserve the child's existing policy KIND (auto-flex OR
      // auto-grid) when authoring its px intrinsic; both carry `sizePx`. Only a
      // policy-less child defaults to a fresh auto-flex policy.
      const curPolicy = (child.attrs as { layoutChild?: LayoutChildPolicy }).layoutChild;
      const nextPolicy: LayoutChildPolicy =
        curPolicy?.kind === "auto-flex" || curPolicy?.kind === "auto-grid"
          ? ({ ...curPolicy, sizePx: input.sizePx } as LayoutChildPolicy)
          : createAutoFlexChildPolicy({ sizePx: input.sizePx });

      const reflow = LAYOUT_FEATURE_ENABLED
        ? reflowHugOnResize({
            root: ctx.document.root,
            itemId: child.id,
            newSizePx: input.sizePx,
            ...(input.designWidth !== undefined ? { designWidth: input.designWidth } : {}),
            ...(input.designHeight !== undefined ? { designHeight: input.designHeight } : {}),
            ...measureTextInput(),
          })
        : [];

      // Merge the child's new sizePx into its reflow frame-patch (one full-attrs
      // patch — avoids the two-patch clobber where a later frame patch drops the
      // sizePx). If the reflow didn't touch the child (frame unchanged / no Hug),
      // emit a standalone sizePx patch.
      let childPatched = false;
      const patches: Patch[] = reflow.map((p) => {
        if (p.type !== "item.attrs" || String(p.itemId) !== String(child.id)) return p;
        childPatched = true;
        const after = (p as { after: Record<string, unknown> }).after;
        return { ...p, after: { ...after, layoutChild: nextPolicy } } as Patch;
      });
      if (!childPatched) {
        patches.push({
          type: "item.attrs",
          itemId: child.id,
          before: child.attrs,
          after: { ...child.attrs, layoutChild: nextPolicy },
        } as Patch);
      }
      return ok(undefined, patches);
    },
  };

  const base: ReadonlyArray<Command> = [
    addItem as Command,
    removeItem as Command,
    removeItems as Command,
    updateItem as Command,
    setShapeCornerRadius as Command,
    setMediaCrop as Command,
    flipItem as Command,
    setShapeFill as Command,
    resizeMulti as Command,
    itemsUpdate as Command,
    itemsLifecycle as Command,
    updateBehavior as Command,
    // WI-077 Phase 1 — dataset 데이터 스토어 (root-unit; chart references by id).
    addDataset as Command,
    updateDataset as Command,
    removeDataset as Command,
    // WI-077 Phase 4 — one-transaction chart create (seed dataset + chart).
    addChart as Command,
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
    breakShapeToLine as Command,
    closeLineToShape as Command,
    removeFrameKeepingChildren as Command,
    // WI-185 ⑭ — Cmd+G wrap-selection-in-frame (group).
    groupItems as Command,
    addBehavior as Command,
    removeBehavior as Command,
    insertPresetSlide as Command,
    clipboardCopy as Command,
    clipboardCut as Command,
    clipboardPastePlaced as Command,
    duplicateItem as Command,
    duplicateItems as Command,
    // WI-183 — Alt-drag duplicate (offset 0; the original keeps moving).
    duplicateItemsInPlace as Command,
    // WI-185 ⑬ — smart duplicate (clone + explicit ratio delta, one undo).
    duplicateItemsWithDelta as Command,
    // WI-155 — rail per-page duplicate (offset 0 + order insert-after).
    pageDuplicate as Command,
    // WI-184 ⑨ — rail multi-select SET duplicate (one transaction).
    pagesDuplicate as Command,
    // WI-184 ⑩ — page add with insert-after-current (rail "+" / agent parity).
    pageAdd as Command,
    // WI-020 / WI-043
    setFrameLayout as Command,
    setItemLayoutChild as Command,
    swapGridCells as Command,
    swapFlexOrder as Command,
    dropGridCell as Command,
    // WI-042 / DR-055 — Figma container sizing (Hug/Fill/Fixed) + Hug resize.
    setFrameSizing as Command,
    resizeHug as Command,
    // DR-028 — decoration as units (shadow/stroke/fill/filter/opacity). The
    // agocraft kit owns the patch semantics; weave just names + uses it. Same
    // instance reused inline by weave.item.update for one-call styled edits (WI-063).
    setDecorationValidated as Command,
  ];

  // WI-096 (DR-065) — weave.batch: run SEVERAL commands as ONE atomic transaction.
  // Each op is dispatched against an EVOLVING working document (op N+1 sees op N's
  // effects, exactly like today's sequential round execs), and ALL patches are
  // returned as a single result → one ChangeStream transaction → one Cmd+Z. If ANY
  // op fails (unknown command / validation / command error), NOTHING is applied
  // (atomic all-or-nothing) — unlike N parallel tool calls where some land and some
  // don't. New ids generated mid-batch are NOT addressable by later ops (the agent
  // writes every input up-front), so batch is for independent edits + edits to
  // EXISTING items; to chain on a freshly-created item, use a follow-up call (still
  // one undo via the agent round group).
  // WI-250 / DR-166 — CENTRAL transaction-effect runner (the foolproof end-state
  // HANDOFF-003 §Step-4 deferred). Every command's FULL output runs through the
  // effect pipeline; `applyEffects` filters engine-derived reflow patches
  // (`isReflowDerived`) so effects react only to PRIMARY patches. Result: a
  // command author emits only primary patches and relayout / group-hug /
  // dissolve attach automatically — no per-command skip-set, no per-call-site
  // `[createPatch]` curation. Reflow a command performs INLINE (add → onChildAdd,
  // reparent → onReparent) is tagged `derived` at the engine boundary, so it is
  // NOT re-derived here (the cascade double-apply that blocked the naive cutover,
  // commit 42f1163, is gone). `batch` is wrapped per-sub-op via `byName` below;
  // the batch command itself stays UNWRAPPED so its aggregate (already-effected)
  // output is not run through the pipeline a second time.
  const effectMetaForInput = (input: unknown): EffectMeta => {
    const dims = getDesignDims();
    const i = input as
      | { sessionId?: unknown; designWidth?: unknown; designHeight?: unknown }
      | null
      | undefined;
    const sessionId = typeof i?.sessionId === "string" ? i.sessionId : undefined;
    const designWidth = typeof i?.designWidth === "number" ? i.designWidth : dims?.w;
    const designHeight = typeof i?.designHeight === "number" ? i.designHeight : dims?.h;
    return {
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(designWidth !== undefined ? { designWidth } : {}),
      ...(designHeight !== undefined ? { designHeight } : {}),
    };
  };
  const withEffects = <I, O>(cmd: Command<I, O>): Command<I, O> => ({
    ...cmd,
    run: (ctx, input) => {
      const r = cmd.run(ctx, input);
      if (!r.ok) return r;
      const fx = applyEffects(ctx, r.patches, effectMetaForInput(input));
      if (!fx.ok) return fail(fx.error.code, fx.error.message);
      return fx.value.length === 0 ? r : ok(r.value, [...r.patches, ...fx.value]);
    },
  });
  const wrappedBase: ReadonlyArray<Command> = base.map((c) => withEffects(c));

  const byName = new Map<string, Command>(wrappedBase.map((c) => [c.name, c]));
  // Commands excluded from a batch: weave.batch (no nesting) + weave.doc.reset
  // (a non-patch side effect that would fire even if a later op aborts the batch).
  const BATCH_DISALLOWED = new Set<string>(["weave.batch", "weave.doc.reset"]);
  const batch: Command<{ readonly ops?: ReadonlyArray<{ command?: string; input?: unknown }> }> = {
    name: "weave.batch",
    run: (ctx, input) => {
      const ops = input?.ops;
      if (!Array.isArray(ops) || ops.length === 0) {
        return fail("invalid-input", "weave.batch: provide a non-empty `ops` array");
      }
      let workingDoc = ctx.document;
      const patches: Patch[] = [];
      const results: unknown[] = [];
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const rawName = op?.command;
        if (typeof rawName !== "string" || rawName === "") {
          return fail("invalid-input", `weave.batch: op ${i} is missing a string \`command\``);
        }
        // openai-api models sometimes write the SANITIZED tool spelling (dots →
        // underscores, or a hybrid like "weave.item_update") as a batch op command.
        // Canonical command names never contain underscores, so "_" → "." recovers
        // the intent without ambiguity (live failure signature, small-think WI-057 era).
        const name = byName.has(rawName) ? rawName : rawName.replace(/_/g, ".");
        if (BATCH_DISALLOWED.has(name)) {
          return fail("command-not-batchable", `weave.batch: "${name}" cannot run inside a batch`);
        }
        const cmd = byName.get(name);
        if (cmd === undefined) {
          return fail(
            "unknown-command",
            `weave.batch: op ${i} references unknown command "${rawName}"`,
          );
        }
        const r = cmd.run({ ...ctx, document: workingDoc }, op?.input);
        if (!r.ok) {
          return fail(
            r.error.code,
            `weave.batch: op ${i} (${name}) failed — ${r.error.message}`,
            r.error.detail,
          );
        }
        results.push(r.value);
        // Evolve the working doc so the next op computes against this op's effect
        // (mirrors sequential exec). applyChangeToDocument === applyPatch; a patch
        // type it doesn't materialize is a no-op here but still applied for real by
        // the transaction runner from the returned list.
        for (const p of r.patches) {
          workingDoc = applyChangeToDocument(
            workingDoc,
            p as unknown as Parameters<typeof applyChangeToDocument>[1],
          );
        }
        patches.push(...r.patches);
      }
      return ok(results, patches);
    },
  };

  return [...wrappedBase, batch];
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
