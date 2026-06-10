// WI-166 / DR-114 — InsertionPolicy pieces: where a selection-less add
// lands. Absorbs FORMAT_EDITOR_CONFIG.defaultContainer (WI-153 P3 /
// DR-111 D5) — use-item-add and the agent surface's host context receive
// the RESOLVED container id and stay policy-free.
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed InsertionPolicy via injection.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { InsertionPolicy } from "../types.js";

/** Free placement: adds land on the design root (`undefined` sentinel —
 *  the shape useItemAdd already understands). */
export function insertAtRoot(): undefined {
  return undefined;
}

/** Page-bounded: adds land in the ACTIVE page (the root is page chrome
 *  there, not an editing surface); no active page → root fallback, same
 *  as the absorbed `defaultContainer === "active-page"` ternary. */
export function insertIntoActivePage(
  _doc: AgocraftDocument,
  activePageId: string | undefined,
): string | undefined {
  return activePageId;
}

/** InsertionPolicy for free-placement flavors (mixed / canvas-board). */
export const ROOT_INSERTION: InsertionPolicy = {
  containerFor: insertAtRoot,
};

/** InsertionPolicy for page-bounded flavors (slide-deck / doc-page). */
export const ACTIVE_PAGE_INSERTION: InsertionPolicy = {
  containerFor: insertIntoActivePage,
};
