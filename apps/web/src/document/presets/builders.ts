// WI-030 — Shared builders for preset factories. Wrap agocraft's attr
// factories (`createTextAttrs`, `defaultShapeAttrs`) into Item-level helpers
// that produce a fully-formed AgocraftItem with `meta`, `units`, and
// pre-set `children`. Keeping these helpers out of individual preset files
// avoids 24 copy-pasted shells; each preset file stays focused on layout.
//
// RISK-002 condition #3 — preset child Items use these helpers (never raw
// object literals) so agocraft schema bumps absorb automatically.
//
// DR-028 — decoration (fill / stroke / shadow / opacity / filter) is no longer
// a shape attr; it is a set of decoration UNITS. `buildShapeChild` accepts the
// same `{ fill, opacity, ... }` overrides as before but routes them into units,
// and always seeds a `decoration.fill` unit (default paint) so a preset shape is
// never invisible. Preset call-sites are unchanged.

import {
  type Item as AgocraftItem,
  createTextAttrs,
  DEFAULT_SHAPE_FILL_PAINT,
  defaultShapeAttrs,
  defaultShapeSubAttrs,
  FILL_UNIT_KIND,
  FILTER_UNIT_KIND,
  type FilterSpec,
  type BuiltinItemFrame as ItemFrame,
  type ItemId,
  itemId as makeItemId,
  unitId as makeUnitId,
  OPACITY_UNIT_KIND,
  type PaintSpec,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  type ShapeSubAttrs,
  type ShapeSubKind,
  STROKE_UNIT_KIND,
  type StrokeSpec,
  type TextAttrs,
  type Unit,
  type UnitId,
} from "@agocraft/core";

/** Keep in sync with `agocraft-mirror.ts:31` `SCHEMA_VERSION`. */
const SCHEMA_VERSION = 3;

export interface BuildContext {
  readonly newId: (prefix: string) => string;
  readonly now: string;
}

/** A frame inside the slide, 0..1 ratio of the slide's frame. */
export type SlideChildFrame = ItemFrame;

/** Decoration overrides for a built item — each becomes a decoration UNIT
 *  (DR-028). Identity values (opacity 1, null stroke/shadow) produce no unit. */
export interface DecorationOverride {
  readonly fill?: PaintSpec;
  readonly stroke?: StrokeSpec | null;
  readonly shadow?: ShadowSpec | null;
  readonly opacity?: number;
  readonly filter?: FilterSpec;
}

/** Intrinsic (non-decoration) shape overrides — these stay on `attrs`. */
export interface ShapeOverride extends DecorationOverride {
  readonly subAttrs?: ShapeSubAttrs;
  readonly rotation?: number;
}

/** Build a text child Item. Caller provides the geometry + override fields;
 *  the rest come from `defaultTextAttrs` via `createTextAttrs`. */
export function buildTextChild(
  ctx: BuildContext,
  frame: SlideChildFrame,
  override: Partial<TextAttrs> & { readonly text: string },
): AgocraftItem {
  const attrs = createTextAttrs({ frame, ...override });
  return makeChild(ctx, "text", attrs as unknown as Readonly<Record<string, unknown>>, []);
}

/** Build a shape child Item. Intrinsic fields (subAttrs / rotation) land on
 *  `attrs`; decoration fields (fill / stroke / shadow / opacity / filter) become
 *  decoration UNITS. A `decoration.fill` unit is always present — `override.fill`
 *  if given, else the default paint (DR-028). */
export function buildShapeChild(
  ctx: BuildContext,
  frame: SlideChildFrame,
  shape: ShapeSubKind,
  override: ShapeOverride = {},
): AgocraftItem {
  const base = defaultShapeAttrs(frame, shape);
  const attrs = {
    ...base,
    frame,
    shape,
    ...(override.rotation !== undefined ? { rotation: override.rotation } : {}),
    subAttrs: override.subAttrs ?? base.subAttrs ?? defaultShapeSubAttrs(shape),
  } as unknown as Readonly<Record<string, unknown>>;
  const units = decorationUnits(ctx, {
    ...override,
    fill: override.fill ?? DEFAULT_SHAPE_FILL_PAINT,
  });
  return makeChild(ctx, "shape", attrs, units);
}

/** Materialize decoration overrides into decoration UNITS. Order matches
 *  `DECORATION_UNIT_KINDS` (paint stack bottom→top). */
function decorationUnits(ctx: BuildContext, deco: DecorationOverride): Unit[] {
  const units: Unit[] = [];
  const u = (kind: string, unitAttrs: Readonly<Record<string, unknown>>): void => {
    const id: UnitId = makeUnitId(ctx.newId("unit"));
    units.push({ id, kind, attrs: unitAttrs, meta: { schemaVersion: SCHEMA_VERSION } });
  };
  if (deco.fill !== undefined)
    u(FILL_UNIT_KIND, deco.fill as unknown as Readonly<Record<string, unknown>>);
  if (deco.stroke != null)
    u(STROKE_UNIT_KIND, deco.stroke as unknown as Readonly<Record<string, unknown>>);
  if (deco.shadow != null)
    u(SHADOW_UNIT_KIND, deco.shadow as unknown as Readonly<Record<string, unknown>>);
  if (deco.opacity !== undefined && deco.opacity !== 1)
    u(OPACITY_UNIT_KIND, { value: deco.opacity });
  if (deco.filter !== undefined)
    u(FILTER_UNIT_KIND, deco.filter as unknown as Readonly<Record<string, unknown>>);
  return units;
}

function makeChild(
  ctx: BuildContext,
  kind: "text" | "shape",
  attrs: Readonly<Record<string, unknown>>,
  units: ReadonlyArray<Unit>,
): AgocraftItem {
  const id: ItemId = makeItemId(ctx.newId(kind));
  return {
    id,
    kind,
    attrs,
    units,
    children: [],
    meta: {
      createdAt: ctx.now,
      updatedAt: ctx.now,
      schemaVersion: SCHEMA_VERSION,
    },
  };
}

/** Build the root frame item that wraps a preset's children.
 *
 *  WI-032 Phase 4 — root kind is `frame` (empty canvas container). Visual
 *  content lives entirely in `children`. Renamed from `buildSlideRoot` once
 *  the paradigm shift landed; the function still ships preset thumbnails
 *  that previously rendered as `slide` items, but the agocraft Item it
 *  produces no longer carries any built-in title / bullets attrs. */
export function buildFrameRoot(
  ctx: BuildContext,
  frame: ItemFrame,
  children: ReadonlyArray<AgocraftItem>,
): AgocraftItem {
  const id: ItemId = makeItemId(ctx.newId("frame"));
  return {
    id,
    kind: "frame",
    attrs: { frame },
    units: [],
    children,
    meta: {
      createdAt: ctx.now,
      updatedAt: ctx.now,
      schemaVersion: SCHEMA_VERSION,
    },
  };
}
