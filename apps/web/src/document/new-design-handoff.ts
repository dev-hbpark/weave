// WI-154 — in-memory handoff for the wizard → editor open of a freshly
// created design.
//
// Under the offline-first model `saveDesign` does NOT write localStorage
// while online (an LS entry means "unsynced offline edit" and trips the
// reconcile prompt) — it only fires a fire-and-forget cloud POST. The
// wizard then navigates immediately, so `useDesign`'s open raced that
// POST: an LS miss fell through to a blank "mixed" placeholder, and the
// mount-time cloud GET usually lost the race (or 404'd outright on a dev
// server with no `/api`), silently dropping the chosen flavor, title and
// flavor-seeded first page. The first edit then pushed the blank over the
// wizard's copy — permanent loss.
//
// Fix: hand the created Design to the editor directly, in memory.
//
// peek/clear (NOT a one-shot take): `useDesign` resolves its initial
// design during RENDER, and React StrictMode double-invokes that render —
// a render-phase delete made the second (surviving) render miss the stash
// and fall back to the blank placeholder again. So the render path only
// peeks; the consumption is committed by a mount effect (`clearNewDesign`)
// so a later reopen goes through the normal LS → cloud resolution.

import type { Design } from "./types.js";

const pending = new Map<string, Design>();

/** Stash a just-created Design for the imminent /design/:id open. */
export function stashNewDesign(design: Design): void {
  pending.set(design.id, design);
}

/** Render-phase read. Does NOT consume — see module comment (StrictMode
 *  double-render); call `clearNewDesign` from a mount effect to commit. */
export function peekNewDesign(id: string): Design | undefined {
  return pending.get(id);
}

/** Commit the handoff: drop the stash so a later reopen resolves through
 *  the normal LS → cloud path instead of a stale seed. Idempotent. */
export function clearNewDesign(id: string): void {
  pending.delete(id);
}
