// 아쿠 (Aku) — agent-only grid-capacity guard stamp (WI-199 / DR-128 #3).
//
// PROBLEM: @agocraft/layout's `onChildAdd` reads the parent's STORED grid spec and
// never grows the track count. A grid sized for K children (e.g. 2×2 = 4 cells)
// has no free cell for the (K+1)th — `nextFreeGridCell` falls back to the LAST
// cell, so the agent's extra items STACK on top of the last one (overlap). The
// grid only ever auto-sizes its tracks at "becomes a grid" time, so generated
// designs that keep adding into a region overflowed silently.
//
// FIX: this pure input transform runs ONLY on the agent's exec path (the
// round-grouping proxy's `transformInput`). It stamps `weave.item.add` input with
// `enforceGridCapacity:true`, switching ON the command-internal grow
// (`document/commands.ts`): when the container is an auto-managed grid and the new
// child would exceed capacity, the spec is regenerated for the new child count and
// an `item.layout` patch persists it. The toolbar never goes through this proxy,
// so a person's deliberately-configured grid track count is never auto-changed.
// Needs no design px, so it is stamped unconditionally.

/** Stamp the agent-only grid-capacity guard onto a `weave.item.add` input.
 *  A no-op for every other command and for non-object input. Pure. */
export function stampGridCapacityGuard(commandName: string, input: unknown): unknown {
  if (commandName !== "weave.item.add") return input;
  if (typeof input !== "object" || input === null) return input;
  return {
    ...(input as Record<string, unknown>),
    enforceGridCapacity: true,
  };
}
