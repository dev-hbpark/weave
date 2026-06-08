// 아쿠 (Aku) — agent-only min-size guard stamp (WI-147).
//
// PROBLEM: the agent sometimes adds an item with a frame ratio so small it
// renders as an invisible sub-10px speck — unusable, nearly unselectable, and
// silent deck bloat. We want such an add REJECTED with the reason handed back to
// the agent, but ONLY for the agent — a person dragging a tiny element on the
// toolbar must never be blocked.
//
// FIX: this pure input transform runs ONLY on the agent's exec path (the
// round-grouping proxy's `transformInput`). It stamps `weave.item.add` input
// with `enforceMinSize:true` + the live design px, which switches ON the
// command-internal guard (`checkAddedItemMinSize` in document/commands.ts). The
// toolbar never goes through this proxy, so it never carries the flag and is
// never guarded. Keeping the DECISION in the command (post layout-staging) is
// what makes the px size exact for flex/grid children too — this module only
// supplies the agent-origin signal + geometry.

export interface DesignSizePx {
  readonly width: number;
  readonly height: number;
}

/** Stamp the agent-only min-size guard onto a `weave.item.add` input. A no-op
 *  for every other command and for non-object input. Pure. */
export function stampMinSizeGuard(
  commandName: string,
  input: unknown,
  design: DesignSizePx,
): unknown {
  if (commandName !== "weave.item.add") return input;
  if (typeof input !== "object" || input === null) return input;
  return {
    ...(input as Record<string, unknown>),
    enforceMinSize: true,
    designWidth: design.width,
    designHeight: design.height,
  };
}
