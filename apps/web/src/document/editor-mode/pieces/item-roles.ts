// WI-166 / DR-114 — RolePolicy pieces: shared role + capability fragments
// the per-flavor composition files under `modes/` assemble from.
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed RolePolicy via injection.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { ItemCapabilities, ItemRole, RolePolicy } from "../types.js";

/** Free-placement flavors (mixed / canvas-board): there is no stage — every
 *  item, including top-level frames, is an ordinary object. */
export function everyItemIsElement(): ItemRole {
  return "element";
}

/** Page-bounded flavors (slide-deck / doc-page): a root-direct item is a
 *  PAGE (artboard) — a fixed editing context, not an object (WI-163).
 *  Everything else is an ordinary element. Same predicate the scattered
 *  `isArtboardId` call sites used, now in one place. */
export function rootDirectIsStage(doc: AgocraftDocument, id: string): ItemRole {
  return doc.root.children.some((c) => String(c.id) === id) ? "stage" : "element";
}

/** An ordinary manipulable object — everything allowed; lock (DR-061)
 *  intersects orthogonally at the consumer. */
export const ELEMENT_CAPABILITIES: ItemCapabilities = {
  movable: true,
  resizable: true,
  rotatable: true,
  deletable: true,
  navigable: true,
  hoverable: true,
  quickActions: true,
  canvasHandles: true,
  selectable: "normal",
};

/** WI-163 / WI-164 — a page (artboard): fixed editing context. No canvas
 *  transform / delete / nav / hover / quick actions; selection only via the
 *  Cmd/Ctrl deep-click escape hatch (page-fill editing keeps the contextual
 *  toolbar, nothing else). */
export const STAGE_CAPABILITIES: ItemCapabilities = {
  movable: false,
  resizable: false,
  rotatable: false,
  deletable: false,
  navigable: false,
  hoverable: false,
  quickActions: false,
  canvasHandles: false,
  selectable: "deep-only",
};

/** RolePolicy for free-placement flavors. */
export const ALL_ELEMENTS_ROLES: RolePolicy = {
  roleOf: everyItemIsElement,
  capabilities: { element: ELEMENT_CAPABILITIES, stage: STAGE_CAPABILITIES },
};

/** RolePolicy for page-bounded flavors. */
export const ROOT_STAGE_ROLES: RolePolicy = {
  roleOf: rootDirectIsStage,
  capabilities: { element: ELEMENT_CAPABILITIES, stage: STAGE_CAPABILITIES },
};
