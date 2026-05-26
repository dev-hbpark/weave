// WI-030 — Shared builders for preset factories. Wrap agocraft's attr
// factories (`createTextAttrs`, `defaultShapeAttrs`) into Item-level helpers
// that produce a fully-formed AgocraftItem with `meta`, empty `units`, and
// pre-set `children`. Keeping these helpers out of individual preset files
// avoids 24 copy-pasted shells; each preset file stays focused on layout.
//
// RISK-002 condition #3 — preset child Items use these helpers (never raw
// object literals) so agocraft schema bumps absorb automatically.

import {
  type Item as AgocraftItem,
  createTextAttrs,
  defaultShapeAttrs,
  defaultShapeSubAttrs,
  type BuiltinItemFrame as ItemFrame,
  type ItemId,
  itemId as makeItemId,
  type ShapeAttrs,
  type ShapeSubKind,
  type TextAttrs,
} from "@agocraft/core";

/** Keep in sync with `agocraft-mirror.ts:31` `SCHEMA_VERSION`. */
const SCHEMA_VERSION = 3;

export interface BuildContext {
  readonly newId: (prefix: string) => string;
  readonly now: string;
}

/** A frame inside the slide, 0..1 ratio of the slide's frame. */
export type SlideChildFrame = ItemFrame;

/** Build a text child Item. Caller provides the geometry + override fields;
 *  the rest come from `defaultTextAttrs` via `createTextAttrs`. */
export function buildTextChild(
  ctx: BuildContext,
  frame: SlideChildFrame,
  override: Partial<TextAttrs> & { readonly text: string },
): AgocraftItem {
  const attrs = createTextAttrs({ frame, ...override });
  return makeChild(ctx, "text", attrs as unknown as Readonly<Record<string, unknown>>);
}

/** Build a shape child Item with overrides on top of `defaultShapeAttrs`. */
export function buildShapeChild(
  ctx: BuildContext,
  frame: SlideChildFrame,
  shape: ShapeSubKind,
  override: Partial<ShapeAttrs> = {},
): AgocraftItem {
  const base = defaultShapeAttrs(frame, shape);
  const attrs: ShapeAttrs = {
    ...base,
    ...override,
    frame,
    shape,
    subAttrs: override.subAttrs ?? base.subAttrs ?? defaultShapeSubAttrs(shape),
  } as ShapeAttrs;
  return makeChild(ctx, "shape", attrs as unknown as Readonly<Record<string, unknown>>);
}

function makeChild(
  ctx: BuildContext,
  kind: "text" | "shape",
  attrs: Readonly<Record<string, unknown>>,
): AgocraftItem {
  const id: ItemId = makeItemId(ctx.newId(kind));
  return {
    id,
    kind,
    attrs,
    units: [],
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
