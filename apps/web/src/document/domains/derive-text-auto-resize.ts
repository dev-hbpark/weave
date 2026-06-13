// WI-042 — compatibility shim for the legacy textAutoResize semantic.
//
// agocraft v10 (WI-019 B4 / T3 Modify Accept) removed `TextAttrs.textAutoResize`
// in favour of `attrs.layoutChild` (`LayoutChildPolicy`). The two concepts are
// orthogonal — `textAutoResize` is about *content reflow inside the box*,
// while `layoutChild.anchor` is about *parent-resize behaviour of the box* —
// but T3 collapsed them into a single user-facing surface.
//
// weave's existing TextBlock render + selection layer still need to switch on
// "Auto-width / Auto-height / Fixed" at render time (overflow rules, height
// observers, selection handles). This helper derives that legacy mode from
// the new policy so the render path is mechanical:
//
//   layoutChild === undefined  → "HEIGHT"             (default, matches legacy)
//   anchor = scale × scale     → "WIDTH_AND_HEIGHT"   (auto-width)
//   anchor = scale × top       → "HEIGHT"             (width follows, auto-height)
//   any other anchor combo     → "NONE"               (Fixed)
//
// This is the exact inverse of agocraft's migrateTextAutoResizeToLayoutChild
// mapping for the three legacy values; the "any other" case is the v1 new
// surface where Figma-style px-fixed anchors land — Fixed semantic is the
// closest match.
//
// When `WI019_LAYOUT_ENABLED` ever flips to true, the LayoutChildPolicy
// picker UI replaces the textAutoResize SegmentedControl directly; this shim
// then becomes a pure derive-for-render compatibility layer.

import type { AutoFlexChildPolicy, LayoutChildPolicy, LayoutSpec } from "@agocraft/core";
import type { ContentAutoAxes } from "@agocraft/layout";

export type LegacyTextAutoResize = "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE";

/** WI-216 / DR-053 Stage 2 (b) — map the engine's per-axis content-auto verdict
 *  to the legacy 3-mode SegmentedControl value. Used by the toolbar (text-section)
 *  for LAID-OUT text, where the mode depends on the parent's flex DIRECTION /
 *  grid alignment — knowledge only the engine has. `deriveTextAutoResize` (which
 *  reads the bare `layoutChild`) cannot tell 자동너비 from 자동높이 on a flex child
 *  because it ignores the main axis + direction; the engine's axes can.
 *    (width, height) → mode:  (T,T)/(T,F) 자동너비 · (F,T) 자동높이 · (F,F) 고정 */
export function contentAutoAxesToMode(axes: ContentAutoAxes): LegacyTextAutoResize {
  if (axes.width) return "WIDTH_AND_HEIGHT";
  if (axes.height) return "HEIGHT";
  return "NONE";
}

export function deriveTextAutoResize(
  layoutChild: LayoutChildPolicy | undefined,
): LegacyTextAutoResize {
  if (layoutChild === undefined) return "HEIGHT";
  // WI-216 / DR-053 Stage 2 (c): a laid-out child's cross size is layout-governed.
  // An EXPLICIT intrinsic size (flex `crossSize` / grid `sizeH`·`sizeW`) is a
  // FIXED size ("고정" — the engine holds it); its ABSENCE is content-auto
  // ("자동높이"). This makes the toolbar label STICKY: after a manual resize the
  // engine stamps `crossSize`, so the text correctly reads "고정" instead of
  // reverting to "자동높이" (the operator-reported bug). (FILL = `alignSelf:
  // "stretch"`, set via the flex-child toolbar — not one of these 3 legacy modes.)
  if (layoutChild.kind === "auto-flex") {
    return layoutChild.crossSize !== undefined ? "NONE" : "HEIGHT";
  }
  if (layoutChild.kind === "auto-grid") {
    return layoutChild.sizeH !== undefined || layoutChild.sizeW !== undefined ? "NONE" : "HEIGHT";
  }
  if (layoutChild.kind !== "absolute-constraints") return "HEIGHT";
  const h = layoutChild.anchor.horizontal;
  const v = layoutChild.anchor.vertical;
  if (h === "scale" && v === "scale") return "WIDTH_AND_HEIGHT";
  if (h === "scale" && v === "top") return "HEIGHT";
  return "NONE";
}

/** Inverse of `deriveTextAutoResize` — picks a canonical `LayoutChildPolicy`
 *  for a chosen legacy mode. `NONE` (Fixed) maps to `left × top` so the box
 *  preserves both absolute position and absolute size on parent resize, which
 *  is what users expect from the "Fixed" label. */
export function layoutChildFromTextAutoResize(mode: LegacyTextAutoResize): LayoutChildPolicy {
  switch (mode) {
    case "WIDTH_AND_HEIGHT":
      return { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "scale" } };
    case "HEIGHT":
      return { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } };
    case "NONE":
      return { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } };
  }
}

/** WI-216 / DR-053 Stage 2 (c)+(b) — pick the child policy for a text resize
 *  mode when the text is a LAID-OUT child (auto-flex / auto-grid).
 *
 *  Unlike the free-text inverse above (which always writes an
 *  absolute-constraints anchor), this KEEPS the existing layout policy and only
 *  toggles the engine-owned intrinsic sizes. Writing an absolute-constraints
 *  anchor onto a flex/grid child is the operator-reported bug: the layout pass
 *  re-derives an auto-flex policy WITHOUT `crossSize`, so "고정" silently reverts
 *  to "자동높이" after the next resize. Here "고정"(NONE) durably stamps the
 *  intrinsic size (the engine then HOLDS it) and "자동높이"(HEIGHT) clears the
 *  cross/height intrinsic so the axis is content-auto again.
 *
 *  Axis convention — flex cross axis = height in a `row`, width in a `column`;
 *  grid sizes both axes independently (`sizeW`/`sizeH`). FILL (`alignSelf:
 *  "stretch"`) is set via the flex-child toolbar, not by these 3 legacy modes,
 *  and is preserved untouched here. Falls back to the free-text inverse for a
 *  free / absolute-constraints parent. `frame` values are parent-relative ratios
 *  (0..1) — the same unit `crossSize` / `sizeW` / `sizeH` carry. */
export function layoutChildForTextResizeMode(
  mode: LegacyTextAutoResize,
  current: LayoutChildPolicy | undefined,
  parentLayout: LayoutSpec | undefined,
  frame: { readonly width: number; readonly height: number },
): LayoutChildPolicy {
  // The 3 legacy modes are 2-D (width-auto?, height-auto?), so BOTH axes are set
  // per mode — not just the cross. This round-trips with the engine's
  // `getContentAutoAxes` (the toolbar's read), regardless of flex direction:
  //   WIDTH_AND_HEIGHT(자동너비) → width auto + height auto
  //   HEIGHT(자동높이)           → width FIXED + height auto
  //   NONE(고정)                 → width FIXED + height FIXED
  const widthAuto = mode === "WIDTH_AND_HEIGHT";
  const heightAuto = mode === "WIDTH_AND_HEIGHT" || mode === "HEIGHT";

  if (parentLayout?.kind === "auto-flex" && current?.kind === "auto-flex") {
    // Map the 2-D width/height intent onto this flex's MAIN / CROSS axes.
    const mainIsWidth = parentLayout.direction === "row";
    const mainAuto = mainIsWidth ? widthAuto : heightAuto;
    const crossAuto = mainIsWidth ? heightAuto : widthAuto;
    const mainSize = mainIsWidth ? frame.width : frame.height;
    const crossSize = mainIsWidth ? frame.height : frame.width;
    const next: AutoFlexChildPolicy = {
      kind: "auto-flex",
      // main auto = hug content (basis "auto", grow 0); fixed = freeze basis.
      grow: mainAuto ? 0 : current.grow,
      shrink: current.shrink,
      basis: mainAuto ? "auto" : mainSize,
      ...(current.alignSelf !== undefined ? { alignSelf: current.alignSelf } : {}),
      ...(crossAuto ? {} : { crossSize }),
    };
    return next;
  }
  if (parentLayout?.kind === "auto-grid" && current?.kind === "auto-grid") {
    const { sizeW: _w, sizeH: _h, ...rest } = current;
    return {
      ...rest,
      ...(widthAuto ? {} : { sizeW: frame.width }),
      ...(heightAuto ? {} : { sizeH: frame.height }),
    };
  }
  return layoutChildFromTextAutoResize(mode);
}
