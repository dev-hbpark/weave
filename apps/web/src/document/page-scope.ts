// WI-153 P4 (DR-111 D5) — scope a document snapshot to the visible page(s).
//
// Page-bounded formats (slide-deck / doc-page) stack every page as a FULL_FRAME
// top-level frame at the SAME coordinates and render only the active one.
// Geometry hit-tests over the raw document (`findFramesAtPoint`) can't see that
// view policy — a point inside the active page also lies inside every HIDDEN
// page (and their nested frames, which sort deeper and win), so a rubber-band
// drag could silently target an invisible page's subtree.
//
// This helper narrows the snapshot the hit-test walks: root children are
// filtered to the visible page ids. Infinite canvas passes `pages: undefined`
// → the document is returned as-is (no allocation, no behavior change).

import type { Document as AgocraftDocument } from "@agocraft/core";

/** Return a shallow copy of `doc` whose root children are only the visible
 *  pages. `pages: undefined` (infinite canvas) or a missing doc → passthrough.
 *  Pure — the original document is never mutated. */
export function scopeDocumentToPages(
  doc: AgocraftDocument | undefined,
  pages: ReadonlySet<string> | undefined,
): AgocraftDocument | undefined {
  if (doc === undefined || pages === undefined) return doc;
  return {
    ...doc,
    root: {
      ...doc.root,
      children: doc.root.children.filter((c) => pages.has(String(c.id))),
    },
  };
}
