// 아쿠 (Aku) — agent-only container-is-frame guard stamp (WI-150 / DR-105).
//
// PROBLEM: the agent sometimes CHAINS `containerId` onto the LAST leaf it
// created instead of the region's layout frame — e.g. after adding the "SAT"
// calendar header text it kept adding the date texts with containerId = that
// text, nesting the whole date column UNDER a leaf. A leaf can't hold children,
// so the layout engine staged a subtree under it and the single cell ballooned
// to swallow the row. Only a `frame` (or the doc root) is a real container.
//
// FIX: this pure input transform runs ONLY on the agent's exec path (the
// round-grouping proxy's `transformInput`). It stamps `weave.item.add` input
// with `enforceContainerIsFrame:true`, which switches ON the command-internal
// reject (`container-not-frame` in document/commands.ts) when `containerId`
// resolves to a non-frame leaf. The toolbar never goes through this proxy, so a
// person adding into any target is never blocked. Unlike the min-size guard
// this needs NO design px, so it is stamped UNCONDITIONALLY (even when the live
// design size is momentarily unavailable).

/** Stamp the agent-only container-is-frame guard onto a `weave.item.add` input.
 *  A no-op for every other command and for non-object input. Pure. */
export function stampContainerGuard(commandName: string, input: unknown): unknown {
  if (commandName !== "weave.item.add") return input;
  if (typeof input !== "object" || input === null) return input;
  return {
    ...(input as Record<string, unknown>),
    enforceContainerIsFrame: true,
  };
}
