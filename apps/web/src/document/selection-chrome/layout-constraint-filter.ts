// Cross-cutting layout-constraint filter (DR-023).
//
// A parent frame's layout (grid / flex) OWNS its children's geometry, so it
// dictates which resize handles + the rotate affordance are valid — regardless
// of the child's item kind. This is NOT a per-kind concern, so it lives as a
// single post-resolve filter over the merged handle specs rather than inside
// each kind's view-model (DR-023 two-stage model: kind-VM registry ⟂ constraint
// filter). Providers only ADD specs; this filter is the single place that
// REMOVES them.
//
// Keys off the canonical handle ids (`resize-<dir>` / `rotate`) emitted by
// `transformHandleSpecs`.

import type { SelectionHandleSpec } from "@agocraft/editor";

export interface LayoutChildConstraints {
  readonly canResizeWidth: boolean;
  readonly canResizeHeight: boolean;
  readonly canRotate: boolean;
}

/** Remove resize/rotate handles the parent layout disallows. `constraints`
 *  undefined (no layout parent / feature off) = pass through unchanged.
 *    • canResizeWidth=false  → drop e/w + all 4 corners (a corner touches both
 *      axes, so it survives only when BOTH axes are resizable).
 *    • canResizeHeight=false → drop n/s + all 4 corners.
 *    • canRotate=false       → drop the rotate handle (Figma auto-layout parity). */
export function applyLayoutConstraintFilter(
  specs: ReadonlyArray<SelectionHandleSpec>,
  constraints: LayoutChildConstraints | undefined,
): ReadonlyArray<SelectionHandleSpec> {
  if (constraints === undefined) return specs;
  if (constraints.canResizeWidth && constraints.canResizeHeight && constraints.canRotate) {
    return specs;
  }
  return specs.filter((spec) => {
    if (spec.id === "rotate") return constraints.canRotate;
    if (spec.id.startsWith("resize-")) {
      const dir = spec.id.slice("resize-".length);
      const touchesW = dir === "e" || dir === "w" || dir.length === 2;
      const touchesH = dir === "n" || dir === "s" || dir.length === 2;
      return (
        (!touchesW || constraints.canResizeWidth) && (!touchesH || constraints.canResizeHeight)
      );
    }
    return true;
  });
}
