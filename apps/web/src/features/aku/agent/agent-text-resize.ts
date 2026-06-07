// 아쿠 (Aku) — agent text-box sizing (fixed-size box for agent-created text).
//
// DECISION (DR-098): when the AGENT adds a text item, the box should be a
// FIXED-size box, not the auto-height default. In weave's model a text box's
// resize behaviour is derived from `attrs.layoutChild` (see
// `document/domains/derive-text-auto-resize.ts`): undefined → auto-height
// ("HEIGHT"); an `absolute-constraints` anchor of `left × top` → Fixed ("NONE").
// So "fixed size" = inject the Fixed `layoutChild` on agent text adds.
//
// GATED ON FREE PLACEMENT: a Fixed box only makes sense for free-placed text
// (root or an `absolute-constraints` parent). Forcing an absolute-constraints
// anchor onto a child of a FLEX/GRID frame would fight the layout (the layout
// owns the child's width and the text must wrap + auto-fit height), so those
// containers are skipped — their text stays auto-height.
//
// Pure input transform applied ONLY on the agent's exec path (round-grouping
// proxy), so the toolbar's explicit resize choice is untouched. Composed with
// `groundAgentFontSize`. Respects an explicit `layoutChild` the agent already set.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { findItemDeep } from "../../../document/agocraft-mirror.js";
import { layoutChildFromTextAutoResize } from "../../../document/domains/derive-text-auto-resize.js";

// The canonical Fixed-box policy (left × top anchor → derives to "NONE"/Fixed).
const FIXED_LAYOUT_CHILD = layoutChildFromTextAutoResize("NONE");

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** True when adding into this container is FREE placement (no auto-layout),
 *  where a Fixed text box is meaningful: the root, an unknown container, or a
 *  frame whose `layout` is absent / `absolute-constraints`. A flex / grid parent
 *  returns false so its text keeps auto-height (the layout owns the size). */
function isFreePlacementContainer(doc: AgocraftDocument, containerId: string | undefined): boolean {
  if (containerId === undefined || containerId === String(doc.root.id)) return true;
  const container = findItemDeep(doc, containerId);
  if (container === undefined) return true;
  const layout = (container.attrs as { layout?: { kind?: string } } | undefined)?.layout;
  return layout === undefined || layout.kind === "absolute-constraints";
}

/** Inject the Fixed `layoutChild` into an agent `weave.item.add` for a text item
 *  placed in a free-placement container. Returns the same reference (no change)
 *  for non-text / non-add / laid-out-parent / already-set cases. Pure; never
 *  throws on shape surprises. */
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
  try {
    if (!isFreePlacementContainer(doc, containerId)) return input;
  } catch {
    return input;
  }
  return { ...input, attrsOverride: { ...attrs, layoutChild: FIXED_LAYOUT_CHILD } };
}
