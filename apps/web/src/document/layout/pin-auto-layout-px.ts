// WI-224 / DR-140 — "px-pinned auto-layout subtree".
//
// weave items have NO stable intrinsic size: they are sized by a parent-relative
// `frame` RATIO. Figma-style auto-layout (Hug / Fill / Fixed) instead needs each
// child to have a STABLE px intrinsic. The mismatch makes both layout subsystems
// circular:
//   • the Hug px pipeline (@agocraft/layout hug-reflow) falls a child's `sizePx`
//     back to `frame × container px` and derives `gapPx` from `gap × container px`
//     — so the container (= children + gap) depends on values that depend on the
//     container → drifts / GROWS on every op, SHRINKS on move.
//   • the Fixed ratio adapter reads a child's CURRENT frame as its "auto" basis
//     → ratchets on repeated reflow.
//
// The structural fix: at every boundary where an auto-layout could become
// inconsistent (setLayout / item.add / setSizing), PIN the px values from the
// CURRENT rendered geometry — each child's `layoutChild.sizePx` + explicit
// basis/crossSize, and the container's `gapPx`/`paddingPx` (grid: column/row gap
// px). The engine treats these px fields as authoritative (they OVERRIDE the
// ratio derivation: `flexPxOf` `gapPx ?? …`, `buildSizingNode` `sizePx ?? abs`),
// so once pinned the whole subtree is px-native and STABLE — no circularity.
//
// IMPORTANT: pin from the container's box BEFORE a Hug re-fit shrinks it, so the
// gap px reflects the authored intent, not the post-hug box.

import {
  type AutoFlexChildPolicy,
  type AutoFlexSpec,
  type AutoGridChildPolicy,
  type AutoGridSpec,
  createAutoFlexChildPolicy,
  createAutoGridChildPolicy,
  type Document as AgocraftDocument,
  type FlexPadding,
  type GridPadding,
  type Item,
  type ItemId,
  type LayoutChildPolicy,
  type LayoutSpec,
  type Patch,
} from "@agocraft/core";
import { absoluteFrameBox } from "../agocraft-mirror.js";
import type { ItemFrame } from "../types.js";

interface Box {
  readonly w: number;
  readonly h: number;
}

const padPx = (
  pad: { top: number; right: number; bottom: number; left: number },
  box: Box,
): { top: number; right: number; bottom: number; left: number } => ({
  top: pad.top * box.h,
  right: pad.right * box.w,
  bottom: pad.bottom * box.h,
  left: pad.left * box.w,
});

/** A px-pinned copy of `layout`: gap/padding ratios baked into their px mirrors
 *  from the container `box`. PRESERVES an already-pinned px field (`?? derive`)
 *  so a fixed gap stays fixed across re-pins (Figma: gap is a fixed px, it does
 *  NOT scale when the container resizes — re-deriving would shrink it on a
 *  re-Hug). Ratios are kept (display/serialization); the px fields are what the
 *  engine reads. Non-auto-layout specs pass through. */
function pinLayoutPx(layout: LayoutSpec, box: Box): LayoutSpec {
  if (layout.kind === "auto-flex") {
    const flex = layout as AutoFlexSpec;
    const mainPx = flex.direction === "row" ? box.w : box.h;
    return {
      ...flex,
      gapPx: flex.gapPx ?? flex.gap * mainPx,
      paddingPx: flex.paddingPx ?? padPx(flex.padding as FlexPadding, box),
    } as LayoutSpec;
  }
  if (layout.kind === "auto-grid") {
    const grid = layout as AutoGridSpec;
    return {
      ...grid,
      columnGapPx: grid.columnGapPx ?? grid.columnGap * box.w,
      rowGapPx: grid.rowGapPx ?? grid.rowGap * box.h,
      paddingPx: grid.paddingPx ?? padPx(grid.padding as GridPadding, box),
    } as LayoutSpec;
  }
  return layout;
}

/** The child's px-pinned policy: `sizePx` from its current absolute px (frame ×
 *  container box) + explicit main/cross intrinsic (frame ratio) so neither the
 *  Hug measure nor the Fixed adapter re-derives from the live frame. Preserves
 *  the rest of the existing policy. `layoutKind` selects flex vs grid policy. */
function pinChildPolicy(
  layoutKind: "auto-flex" | "auto-grid",
  direction: "row" | "column",
  frame: ItemFrame,
  box: Box,
  cur: LayoutChildPolicy | undefined,
): LayoutChildPolicy {
  const sizePx = { w: frame.width * box.w, h: frame.height * box.h };
  if (layoutKind === "auto-flex") {
    const flex = cur !== undefined && cur.kind === "auto-flex" ? cur : undefined;
    const mainIsWidth = direction === "row";
    return createAutoFlexChildPolicy({
      ...(flex !== undefined
        ? {
            grow: flex.grow,
            shrink: flex.shrink,
            basis: flex.basis,
            ...(flex.alignSelf !== undefined ? { alignSelf: flex.alignSelf } : {}),
          }
        : {}),
      basis: mainIsWidth ? frame.width : frame.height,
      crossSize: mainIsWidth ? frame.height : frame.width,
      sizePx,
    });
  }
  const gridCur = cur !== undefined && cur.kind === "auto-grid" ? cur : undefined;
  return createAutoGridChildPolicy({
    ...(gridCur !== undefined
      ? {
          column: gridCur.column,
          columnSpan: gridCur.columnSpan,
          row: gridCur.row,
          rowSpan: gridCur.rowSpan,
          ...(gridCur.justifySelf !== undefined ? { justifySelf: gridCur.justifySelf } : {}),
          ...(gridCur.alignSelf !== undefined ? { alignSelf: gridCur.alignSelf } : {}),
        }
      : {}),
    sizeW: frame.width,
    sizeH: frame.height,
    sizePx,
  });
}

export interface PinnedAutoLayout {
  /** `layout` with gap/padding px baked — merge into the container's attrs. */
  readonly layout: LayoutSpec;
  /** New child policy per direct child id (sizePx + explicit intrinsic). */
  readonly childPolicies: ReadonlyMap<string, LayoutChildPolicy>;
  /** `item.layoutChild` patches (one per direct child) — append to the txn. */
  readonly childPatches: ReadonlyArray<Patch>;
}

/** Pin the px intrinsics of an auto-flex / auto-grid container + its direct
 *  children from the CURRENT geometry. `layout` is the spec to pin (the caller's
 *  next layout — already includes any sizing change). Returns the pinned layout
 *  + per-child policies/patches. No-op (echoes `layout`, empty children) when the
 *  container has no resolvable box (no design basis) or `layout` isn't an
 *  auto-layout — fail-open, no regression. */
export function pinAutoLayoutPx(
  doc: AgocraftDocument,
  container: Item,
  layout: LayoutSpec,
  designWidth: number,
  designHeight: number,
): PinnedAutoLayout {
  const empty = { layout, childPolicies: new Map(), childPatches: [] };
  if (layout.kind !== "auto-flex" && layout.kind !== "auto-grid") return empty;
  if (!(designWidth > 0) || !(designHeight > 0)) return empty;
  const box = absoluteFrameBox(doc, String(container.id), designWidth, designHeight);
  if (box === null || !(box.w > 0) || !(box.h > 0)) return empty;

  const direction = layout.kind === "auto-flex" ? (layout as AutoFlexSpec).direction : "row";
  const childPolicies = new Map<string, LayoutChildPolicy>();
  const childPatches: Patch[] = [];
  for (const c of container.children) {
    const frame = (c.attrs as { frame?: ItemFrame }).frame;
    if (frame === undefined) continue;
    const cur = (c.attrs as { layoutChild?: LayoutChildPolicy }).layoutChild;
    const next = pinChildPolicy(layout.kind, direction, frame, box, cur);
    childPolicies.set(String(c.id), next);
    childPatches.push({ type: "item.layoutChild", itemId: c.id, before: cur, after: next } as Patch);
  }
  return { layout: pinLayoutPx(layout, box), childPolicies, childPatches };
}

/** Stage `pinned` into a cloned `root`: the container gets the pinned layout and
 *  each direct child gets its pinned policy. Used so a Hug re-fit run AFTER
 *  pinning reads the stable px values. */
export function stagePinned(
  root: Item,
  containerId: ItemId,
  pinned: PinnedAutoLayout,
  mapItemDeep: (item: Item, targetId: ItemId, patch: (item: Item) => Item) => Item,
): Item {
  return mapItemDeep(root, containerId, (cont) => ({
    ...cont,
    attrs: { ...cont.attrs, layout: pinned.layout },
    children: cont.children.map((ch) => {
      const pol = pinned.childPolicies.get(String(ch.id));
      return pol === undefined ? ch : { ...ch, attrs: { ...ch.attrs, layoutChild: pol } };
    }),
  }));
}
