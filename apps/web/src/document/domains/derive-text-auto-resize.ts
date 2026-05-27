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

import type { LayoutChildPolicy } from "@agocraft/core";

export type LegacyTextAutoResize = "WIDTH_AND_HEIGHT" | "HEIGHT" | "NONE";

export function deriveTextAutoResize(
  layoutChild: LayoutChildPolicy | undefined,
): LegacyTextAutoResize {
  if (layoutChild === undefined) return "HEIGHT";
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
