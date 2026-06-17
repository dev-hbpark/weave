// WI-166 / DR-114 — InsertionPolicy pieces: where a selection-less add
// lands. Absorbs FORMAT_EDITOR_CONFIG.defaultContainer (WI-153 P3 /
// DR-111 D5) — use-item-add and the agent surface's host context receive
// the RESOLVED container id and stay policy-free.
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed InsertionPolicy via injection.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { findItemDeep } from "../../agocraft-mirror.js";
import { isContainerKind } from "../../domain-kinds.js";
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

/** WI-180 free placement: a selected CONTAINER is an editing surface — the
 *  explicit add lands inside it; anything else (no selection, leaf primitive,
 *  stale id) falls through to the design root. Containment is read from the
 *  kind's `structure` (`isContainerKind`) rather than a `=== "frame"` literal,
 *  so a future container kind (e.g. group) becomes an editing surface here
 *  automatically. Today only frame is a container — behaviour-identical. */
export function addIntoSelectedFrame(
  doc: AgocraftDocument,
  _activePageId: string | undefined,
  selectedId: string | undefined,
): string | undefined {
  if (selectedId === undefined) return undefined;
  const sel = findItemDeep(doc, selectedId);
  return sel !== undefined && isContainerKind(sel.kind) ? selectedId : undefined;
}

/** WI-180 page-bounded: sub-page frames are GROUPS, not editing surfaces —
 *  an explicit add lands on the ACTIVE PAGE regardless of the selection
 *  (Canva model). Selecting the page itself (deep-click escape hatch)
 *  resolves to the same id. */
export function addIntoActivePage(
  _doc: AgocraftDocument,
  activePageId: string | undefined,
  _selectedId: string | undefined,
): string | undefined {
  return activePageId;
}

/** InsertionPolicy for free-placement flavors (mixed / canvas-board). */
export const ROOT_INSERTION: InsertionPolicy = {
  containerFor: insertAtRoot,
  addContainerFor: addIntoSelectedFrame,
  pasteCoord: "cursor",
};

/** InsertionPolicy for page-bounded flavors (slide-deck / doc-page).
 *  pasteCoord "source-position" (WI-185 ⑫, spec D-5): pages are same-size
 *  twins, so preserving the source's parent-ratio frame across a
 *  cross-page paste IS the office "same coordinates" contract. */
export const ACTIVE_PAGE_INSERTION: InsertionPolicy = {
  containerFor: insertIntoActivePage,
  addContainerFor: addIntoActivePage,
  pasteCoord: "source-position",
};
