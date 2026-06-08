// 아쿠 (Aku) — agent text layout-policy fix (give agent-added text the RIGHT
// `attrs.layoutChild` for the container it lands in).
//
// In weave's model a text box's sizing is derived from `attrs.layoutChild` (see
// `document/domains/derive-text-auto-resize.ts`). When the AGENT adds a text we
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
//  • auto-flex COLUMN / auto-grid — left ALONE (return input). A column's main
//    axis is height (width is the cross axis, bound by align/stretch) and a grid
//    cell's track bounds the width, so the full-width seed is harmless there and
//    the layout owns the size (auto-height text). Deliberate asymmetry (narrow
//    badge + wide body) is the agent's job via a grid track or an explicit
//    grow/basis — both short-circuit this stamp (an agent-set layoutChild wins).
//
// Pure input transform applied ONLY on the agent's exec path (round-grouping
// proxy), so the toolbar's explicit choices are untouched. Respects an explicit
// `layoutChild` the agent already set.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import { layoutChildFromTextAutoResize } from "../../../document/domains/derive-text-auto-resize.js";

// The canonical Fixed-box policy (left × top anchor → derives to "NONE"/Fixed).
const FIXED_LAYOUT_CHILD = layoutChildFromTextAutoResize("NONE");

// CSS `flex:1` — share the row's main axis, contribute 0 base size so the row
// can never over-fill from the full-width seed (→ no shrink → no ratchet).
const FLEX_ROW_SHARE = { kind: "auto-flex", grow: 1, shrink: 1, basis: 0 } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** The container's layout kind+direction, as the policy decision needs it.
 *  Root / unknown / no-layout / absolute → "free"; an auto-flex row → "flex-row";
 *  everything else (flex column, grid) → "managed" (leave the text to the
 *  layout). */
type ContainerLayout = "free" | "flex-row" | "managed";

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
  if (layout.kind === "auto-flex" && layout.direction === "row") return "flex-row";
  return "managed";
}

/** Inject the right `layoutChild` into an agent `weave.item.add` for a text item
 *  based on its container's layout: Fixed box for free placement (DR-098), a
 *  CSS-`flex:1` sharing policy for an auto-flex ROW (DR-104), and no change for a
 *  managed (flex-column / grid) parent. Returns the same reference for non-text /
 *  non-add / already-set / managed cases. Pure; never throws on shape surprises. */
export function fixAgentTextBox(
  commandName: string,
  input: unknown,
  doc: AgocraftDocument,
): unknown {
  if (commandName !== "weave.item.add" || !isObj(input)) return input;
  if (input.kind !== "text") return input;
  const attrs = isObj(input.attrsOverride) ? input.attrsOverride : {};
  // Respect an explicit layoutChild the agent set (e.g. a deliberate auto-width).
  if (attrs.layoutChild !== undefined) return input;
  const containerId = typeof input.containerId === "string" ? input.containerId : undefined;
  let kind: ContainerLayout;
  try {
    kind = containerLayoutKind(doc, containerId);
  } catch {
    return input;
  }
  if (kind === "free") {
    return { ...input, attrsOverride: { ...attrs, layoutChild: FIXED_LAYOUT_CHILD } };
  }
  if (kind === "flex-row") {
    return { ...input, attrsOverride: { ...attrs, layoutChild: { ...FLEX_ROW_SHARE } } };
  }
  return input;
}
