// 아쿠 (Aku) — agent layout-child policy fix (give an agent-added item the RIGHT
// `attrs.layoutChild` for the container it lands in). Despite the export name
// `fixAgentTextBox` (kept so the use-aku-agent proxy import is untouched), this
// covers ALL kinds — text and non-text alike.
//
// In weave's model a box's sizing is derived from `attrs.layoutChild` (see
// `document/domains/derive-text-auto-resize.ts`). When the AGENT adds an item we
// pick the right policy from the CONTAINER's layout kind:
//
//  • FREE placement (root / no layout / absolute-constraints) — DR-098: a Fixed
//    box (left×top anchor → derives to "NONE"). Free-placed text does not get a
//    layout-owned width, so a Fixed box (explicit w×h) is what makes it usable.
//
//  • auto-flex ROW — DR-104 / WI-149: a SHARING policy `{grow:1, shrink:1,
//    basis:0}` (CSS `flex:1`). WHY: the text seed frame is FULL_FRAME (width
//    1.0). Added with no `frame`, two full-width texts OVER-FILL the row;
//    agocraft's auto-flex then shrinks them with no min-content floor (toward 0)
//    and `joinPolicy` FREEZES the shrunk width as a numeric `basis` with
//    `grow:0` — a one-way ratchet that strands the later child at a ~1-glyph
//    vertical sliver. basis:0 makes the child contribute nothing to the row's
//    base size (so it never over-fills → never shrinks → the ratchet can't
//    start) and grow:1 shares the row evenly. agocraft's `onChildAdd` RESPECTS a
//    policy whose kind matches the parent layout, so it keeps this verbatim
//    instead of freezing the full-width seed.
//
//  • TEXT in auto-flex COLUMN / auto-grid — left ALONE. A column's main axis is
//    height (width is the cross axis, bound by align/stretch) and a grid cell's
//    track bounds the width, so the full-width seed is harmless and the layout
//    owns the size (auto-height text — grow on a column-text would inflate its
//    HEIGHT, which we must not do).
//
//  • NON-TEXT (frame / shape / image / qr / line / chart …) in auto-flex ROW or
//    COLUMN — WI-149 round 3 / DR-104: the SAME FULL_FRAME ratchet, but on the
//    OTHER axis. A frame added with no `frame` inherits FULL_FRAME on the main
//    axis (width in a row, HEIGHT in a column); `joinPolicy` freezes that 1.0 as
//    `basis` with `grow:0`, so N such cards over-fill N× (observed: 5 full-width
//    card frames in a row, 5.16× over-fill; full-height cards in a column blow
//    out past the slide). Stamp `flex:1` (basis:0 → never over-fills; grow:1 →
//    shares evenly) — UNLESS the agent set an explicit main-axis size (e.g. a
//    `qr` at width 0.1, which we respect). Grid parents are left to their track.
//
// Pure input transform applied ONLY on the agent's exec path (round-grouping
// proxy), so the toolbar's explicit choices are untouched. Respects an explicit
// `layoutChild` the agent already set.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import { layoutChildFromTextAutoResize } from "../../../document/domains/derive-text-auto-resize.js";

// The canonical Fixed-box policy (left × top anchor → derives to "NONE"/Fixed).
const FIXED_LAYOUT_CHILD = layoutChildFromTextAutoResize("NONE");

// CSS `flex:1` — grow to share the main axis, contribute 0 base size so the
// container can NEVER over-fill from the full-frame seed (→ no shrink → no
// freeze ratchet). Used on BOTH axes: a row child shares width, a column child
// shares height.
const FLEX_SHARE = { kind: "auto-flex", grow: 1, shrink: 1, basis: 0 } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** The container's layout kind+direction, as the policy decision needs it.
 *  Root / unknown / no-layout / absolute → "free"; an auto-flex row → "flex-row";
 *  an auto-flex column → "flex-col"; an auto-grid → "grid" (the track owns the
 *  cell, leave it alone). */
type ContainerLayout = "free" | "flex-row" | "flex-col" | "grid";

function containerLayoutKind(
  doc: AgocraftDocument,
  containerId: string | undefined,
): ContainerLayout {
  if (containerId === undefined || containerId === String(doc.root.id)) return "free";
  const container = findItemDeep(doc, containerId);
  if (container === undefined) return "free";
  const layout = (container.attrs as { layout?: { kind?: string; direction?: string } } | undefined)
    ?.layout;
  if (layout === undefined || layout.kind === "absolute-constraints") return "free";
  if (layout.kind === "auto-flex") return layout.direction === "row" ? "flex-row" : "flex-col";
  return "grid";
}

/** True when the agent gave an explicit, positive MAIN-axis size on the add's
 *  `frame` (width for a row, height for a column) — a deliberate size we must
 *  NOT override (e.g. a `qr` added at width 0.1). When absent, the item would
 *  inherit the FULL_FRAME (1.0) seed on that axis and over-fill the container. */
function hasExplicitMainSize(input: Record<string, unknown>, container: ContainerLayout): boolean {
  const fr = isObj(input.frame) ? input.frame : undefined;
  if (fr === undefined) return false;
  const dim = container === "flex-row" ? fr.width : fr.height;
  return typeof dim === "number" && Number.isFinite(dim) && dim > 0;
}

/** Pick the right `layoutChild` for an agent-added item from its container's
 *  layout — so the item is sized correctly the moment it's created, never by a
 *  post-render correction. (Despite the name this now covers ALL kinds; the
 *  `use-aku-agent` proxy calls it for every add.)
 *
 *  TEXT:    free → Fixed box (DR-098); flex ROW → CSS `flex:1` share (DR-104);
 *           flex COLUMN / grid → leave (auto-height, the layout owns the size).
 *  NON-TEXT (frame / shape / image / qr / line / chart …): flex ROW or COLUMN
 *           → CSS `flex:1` share so it can't inherit the FULL_FRAME (1.0) seed on
 *           the main axis and over-fill (WI-149 round 3 — a row of 5 full-width
 *           card frames was over-filling 5×). Only when the agent set NO explicit
 *           main-axis size (a deliberate size like `qr` 0.1 is respected); free /
 *           grid parents are left to their own placement.
 *
 *  Returns the same reference for non-add / already-set / left-alone cases. An
 *  explicit `layoutChild` from the agent always wins. Pure; never throws. */
export function fixAgentTextBox(
  commandName: string,
  input: unknown,
  doc: AgocraftDocument,
): unknown {
  if (commandName !== "weave.item.add" || !isObj(input)) return input;
  const attrs = isObj(input.attrsOverride) ? input.attrsOverride : {};
  // Respect an explicit layoutChild the agent set (e.g. a deliberate auto-width
  // or grow/basis split).
  if (attrs.layoutChild !== undefined) return input;
  const containerId = typeof input.containerId === "string" ? input.containerId : undefined;
  let container: ContainerLayout;
  try {
    container = containerLayoutKind(doc, containerId);
  } catch {
    return input;
  }
  const withChild = (policy: unknown): Record<string, unknown> => ({
    ...input,
    attrsOverride: { ...attrs, layoutChild: policy },
  });

  if (input.kind === "text") {
    if (container === "free") return withChild(FIXED_LAYOUT_CHILD);
    if (container === "flex-row") return withChild({ ...FLEX_SHARE });
    return input; // flex-col / grid — auto-height text, the layout owns the size
  }
  // Non-text: share the main axis in any flex parent, but only when the item
  // would otherwise inherit the full-frame seed on that axis.
  if (
    (container === "flex-row" || container === "flex-col") &&
    !hasExplicitMainSize(input, container)
  ) {
    return withChild({ ...FLEX_SHARE });
  }
  return input;
}
