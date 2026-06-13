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
//  • TEXT in auto-flex COLUMN — WI-215: stamp `alignSelf:"stretch"` (keeping
//    grow:0 / shrink:1 / basis:"auto" so the HEIGHT still follows the wrapped
//    content). WHY: a column's CROSS axis is the WIDTH, and the DEFAULT parent
//    `align` is "start" (DEFAULT_AUTO_FLEX_SPEC), NOT "stretch" — so unless the
//    agent remembered to set the column's `align:"stretch"` (or the child's
//    `alignSelf`), the text's width is NOT bound by the column and collapses to
//    its intrinsic crossSize/seed → a ~1-glyph VERTICAL ribbon (the same sliver
//    symptom as the row case, but driven by the cross axis). The capabilities /
//    schema prose already tells the agent "in a COLUMN set align/alignSelf
//    'stretch' for text", but that was prompt-hoped only; this enforces it in
//    code at the agent seam. `stretch` fills the cross axis (width → wraps),
//    never the main axis (height stays auto), so it is safe for auto-height
//    text. A short title still looks centered via textAlign — only the BOX
//    fills the column width.
//
//  • TEXT in auto-grid — WI-215: if the agent set a cell-placement policy
//    (column/row) that omits `justifySelf`, MERGE `justifySelf:"stretch"` so the
//    text fills the column track regardless of the parent's `justify` (an agent
//    commonly sets `justify:"center"`, which sizes the child from its intrinsic
//    width — 0 for an agent add → sliver). When there is NO policy at all we
//    can't stamp a `justifySelf` (no column/row → the adapter can't place the
//    cell), so instead we DROP a degenerate (near-0) incoming `frame.width`: the
//    child falls back to the FULL_FRAME seed, which the cell clamps to the track
//    width. A no-frame / real-width add is already fine (the seed or the real
//    width fills/clamps to the cell).
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

// WI-215 — column TEXT: bind the CROSS axis (width) so the text wraps to the
// column, but leave the MAIN axis (height) auto. `alignSelf:"stretch"` fills the
// column width regardless of the parent's `align` (which defaults to "start", not
// "stretch"); grow:0 + basis:"auto" keep the height following the wrapped content.
const FLEX_COL_TEXT = {
  kind: "auto-flex",
  grow: 0,
  shrink: 1,
  basis: "auto",
  alignSelf: "stretch",
} as const;

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

/** True when the add carries an explicit `frame.width` that is degenerate
 *  (≤ the engine's MIN_MAIN_SHARE floor of 0.04) — a value that would starve a
 *  layout child read intrinsically (non-stretch grid/flex). Dropping it lets the
 *  FULL_FRAME seed size the child instead. */
function hasDegenerateWidth(input: Record<string, unknown>): boolean {
  const fr = isObj(input.frame) ? input.frame : undefined;
  if (fr === undefined) return false;
  return typeof fr.width === "number" && Number.isFinite(fr.width) && fr.width <= 0.04;
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
 *           flex COLUMN → `alignSelf:"stretch"`; auto-GRID → `justifySelf:"stretch"`
 *           — both BIND THE CROSS / COLUMN axis (the WIDTH) so the text wraps and
 *           the box can't collapse to a vertical sliver, while the main / row axis
 *           (the HEIGHT) stays auto (WI-215). WHY a stretch is forced: the cross /
 *           column-axis alignment DEFAULTS to a non-stretch value (flex `align`
 *           defaults to "start"; an agent commonly sets a GRID's `justify`/`align`
 *           to "center" — observed live), and when NOT stretching the layout sizes
 *           the child from its intrinsic width (`crossSize`/`sizeW`), which for an
 *           agent-added auto-height text is 0 → a ~1-glyph ribbon. Crucially, for a
 *           COLUMN/GRID this stretch is merged in EVEN WHEN the agent already set a
 *           `layoutChild` (it carries the GRID cell placement `column`/`row`) — we
 *           only add the width-binding the agent omitted, and respect an explicit
 *           `alignSelf`/`justifySelf` it DID choose.
 *  NON-TEXT (frame / shape / image / qr / line / chart …): flex ROW or COLUMN
 *           → CSS `flex:1` share so it can't inherit the FULL_FRAME (1.0) seed on
 *           the main axis and over-fill (WI-149 round 3 — a row of 5 full-width
 *           card frames was over-filling 5×). Only when the agent set NO explicit
 *           `layoutChild` and NO explicit main-axis size (a deliberate size like
 *           `qr` 0.1 is respected); free / grid parents are left to their own
 *           placement.
 *
 *  Returns the same reference for non-add / left-alone cases. Pure; never throws. */
export function fixAgentTextBox(
  commandName: string,
  input: unknown,
  doc: AgocraftDocument,
): unknown {
  if (commandName !== "weave.item.add" || !isObj(input)) return input;
  const attrs = isObj(input.attrsOverride) ? input.attrsOverride : {};
  const existingLc = attrs.layoutChild;
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
    // A text whose WIDTH is not bound to its cell collapses to a vertical sliver.
    // In a flex COLUMN / auto-GRID the agent often sets a `layoutChild` for cell
    // placement but omits the cross/column-axis stretch, so MERGE the stretch in
    // (preserving its placement) instead of bailing — unless the agent chose its
    // own cross/column-axis alignment, which we respect.
    if (container === "flex-col") {
      if (existingLc === undefined) return withChild({ ...FLEX_COL_TEXT });
      if (
        isObj(existingLc) &&
        existingLc.kind === "auto-flex" &&
        existingLc.alignSelf === undefined
      ) {
        return withChild({ ...existingLc, alignSelf: "stretch" });
      }
      return input;
    }
    if (container === "grid") {
      if (
        isObj(existingLc) &&
        existingLc.kind === "auto-grid" &&
        existingLc.justifySelf === undefined
      ) {
        return withChild({ ...existingLc, justifySelf: "stretch" });
      }
      // No cell policy (the grid auto-places + sizes the child): we can't stamp a
      // `justifySelf` without a column/row, but a NON-stretch parent `justify`
      // would size the child from its intrinsic width — and a degenerate
      // (near-0) incoming `frame.width` then collapses it to a sliver. The grid
      // owns position + width, so DROP a degenerate frame: the child falls back
      // to the FULL_FRAME seed, which the cell clamps to the track width (fills).
      if (existingLc === undefined && hasDegenerateWidth(input)) {
        const { frame: _dropped, ...rest } = input;
        return rest;
      }
      return input; // no policy (seed fills) or explicit justifySelf
    }
    // free / flex-row: only act when the agent set NO explicit policy.
    if (existingLc !== undefined) return input;
    if (container === "free") return withChild(FIXED_LAYOUT_CHILD);
    if (container === "flex-row") return withChild({ ...FLEX_SHARE });
    return input;
  }
  // Respect an explicit layoutChild the agent set on a NON-text item (e.g. a
  // deliberate grow/basis split or cell placement).
  if (existingLc !== undefined) return input;
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
