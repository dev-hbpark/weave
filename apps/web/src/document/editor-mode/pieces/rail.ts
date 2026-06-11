// WI-166 / DR-114 §4 — RailPolicy pieces: how the bottom thumbnail rail is
// composed per flavor. The ThumbnailPanel never sees this policy — the
// DesignPage call site reads it and fills/empties the panel's optional
// props ("no prop → no render" slots).
//
// P2 carries the two APPROVED behavior changes (DR-114 §4):
//   · mixed loses the trailing "+" add-page tile (free placement adds
//     frames from the toolbar, not the rail; rail "+" created stray
//     full-frame pages).
//   · slide-deck / doc-page lose the non-slide section, the deck-membership
//     toggle and the focus eye (one page renders at a time — dim/isolate
//     and deck exclusion are free-placement concepts).
//
// Pure frozen data only. Consumers never import this file (DR-114 §2b).

import type { RailPolicy } from "../types.js";

/** Rail for free-placement flavors (mixed / canvas-board): an overview +
 *  deck-curation surface — not a page lifecycle owner. */
export const OVERVIEW_RAIL: RailPolicy = {
  visible: true,
  nonSlideSection: true,
  slideToggle: true,
  focusCycle: true,
  addPage: false,
  duplicatePage: false,
  deletePage: true,
  clickActivatesPage: false,
  // WI-189 — deck curation is set-shaped: Shift/Cmd multi-select enables
  // batch delete + batch drag-reorder. Set duplicate stays hidden via the
  // independent `duplicatePage: false` gate above.
  multiSelect: true,
  // WI-189 — frame-attrs rows only: rename (`attrs.title`) and skip-in-show
  // (`attrs.skipped` — `presentationStepIds` filters it in every flavor, so
  // without this row a doc skip-marked under slide-deck had no unskip
  // affordance here). Page-lifecycle rows (newPageAfter / editBackground)
  // are meaningless on an overview rail.
  tileMenuRows: new Set(["rename", "skipInShow"]),
};

/** Rail for page-bounded flavors (slide-deck / doc-page): the page
 *  lifecycle owner (add / duplicate / activate — WI-153 P2, WI-155). */
export const PAGE_LIFECYCLE_RAIL: RailPolicy = {
  visible: true,
  nonSlideSection: false,
  slideToggle: false,
  focusCycle: false,
  addPage: true,
  duplicatePage: true,
  deletePage: true,
  clickActivatesPage: true,
  // WI-184 ⑨ — Shift/Cmd rail multi-select + set duplicate/delete/reorder.
  multiSelect: true,
  // WI-184 ⑪ / WI-189 — full menu: frame-attrs rows + page-lifecycle rows.
  tileMenuRows: new Set(["rename", "skipInShow", "newPageAfter", "editBackground"]),
};
