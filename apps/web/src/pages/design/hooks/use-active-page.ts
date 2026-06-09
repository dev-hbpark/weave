// WI-153 P2 — active-page state for page-bounded (one-page-at-a-time) editing.
//
// Page-bounded formats (slide-deck / doc-page) show ONE page at a time instead of
// the whole design with every top-level frame stacked. "Active page" is the page
// currently shown/edited — distinct from `selectedFrameId` (transient selection) and
// `focusedId` (manual eye-toggle). It is keyed to a presentationOrder entry.

import { useState } from "react";

/** Resolve which page is active: the candidate if it is still a page in the order,
 *  else the first page (or undefined when there are no pages). Pure — keeps the
 *  active page valid across reorder / delete without an effect. */
export function resolveActivePage(
  order: ReadonlyArray<string>,
  candidate: string | undefined,
): string | undefined {
  if (candidate !== undefined && order.includes(candidate)) return candidate;
  return order[0];
}

/** Active-page state. `enabled` (page-bounded format) false → `activePageId` is
 *  undefined (infinite canvas shows all frames, no page scoping). The candidate is
 *  stored raw and resolved against the live order on every render so a reorder or a
 *  deleted page never strands the view on a missing id. */
export function useActivePage(
  order: ReadonlyArray<string>,
  enabled: boolean,
): { readonly activePageId: string | undefined; readonly setActivePageId: (id: string) => void } {
  const [candidate, setCandidate] = useState<string | undefined>(undefined);
  const activePageId = enabled ? resolveActivePage(order, candidate) : undefined;
  return { activePageId, setActivePageId: setCandidate };
}
