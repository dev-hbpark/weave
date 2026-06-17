// WI-245 / DR-162 — transform.flip UNIT MODEL.
//
// The flip case the operator highlighted: its behaviour DIFFERS from a plain
// kind-agnostic unit — a flip is meaningless / harmful for some kinds (`qr`
// breaks scannability, `text` becomes unreadable). That rule is the UNIT's
// concern, not the command's: `appliesTo` encodes it, and `toggle` is the unit's
// manipulation operation. The `weave.item.flip` command then ORCHESTRATES (find
// item → appliesTo → toggle → emit) with no inline kind gate and no raw setter.

import type { Item as AgocraftItem } from "@agocraft/core";
import { FLIP_ALLOWED_KINDS, FLIP_UNIT_KIND, type FlipState, readFlip } from "../transform-flip.js";
import { type UnitModel, type UnitResult, unitOk } from "./unit-model.js";

export type FlipAxis = "horizontal" | "vertical";

function validate(candidate: unknown): UnitResult<FlipState> {
  const c = candidate as { flipH?: unknown; flipV?: unknown } | undefined;
  // Booleans only; anything else coerces to false (a flip is a 2-bit state).
  return unitOk({ flipH: c?.flipH === true, flipV: c?.flipV === true });
}

/** The flip unit model — base contract + the `toggle` manipulation + the axis
 *  guard the command uses. */
export const flipUnit: UnitModel<FlipState> & {
  toggle(cur: FlipState, axis: FlipAxis): FlipState;
  isAxis(v: unknown): v is FlipAxis;
} = {
  kind: FLIP_UNIT_KIND,
  read: readFlip,
  validate,
  // DR-029 D7 — the per-unit applicability rule (was an inline kind gate in the
  // command). Excludes text/qr; frame is a display-only flip.
  appliesTo: (item: AgocraftItem) => FLIP_ALLOWED_KINDS.has((item as { kind?: string }).kind ?? ""),
  // Clear the unit when neither axis is set; otherwise persist the 2-bit state.
  toAttrs: (f) => (f.flipH || f.flipV ? { flipH: f.flipH, flipV: f.flipV } : null),
  // ── manipulation ──
  toggle: (cur, axis) => ({
    flipH: axis === "horizontal" ? !cur.flipH : cur.flipH,
    flipV: axis === "vertical" ? !cur.flipV : cur.flipV,
  }),
  isAxis: (v): v is FlipAxis => v === "horizontal" || v === "vertical",
};
