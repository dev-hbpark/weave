// WI-214 / DR-137 — Selection breadcrumb trail. Given the currently
// selected frame id, return the chain of ancestor segments the breadcrumb
// bar renders (top-level frame → … → selected, inclusive).
//
// Pure: no React, no DOM, no vm. Doc + id in, segments out. Testable in
// isolation; the bar component + DesignPage wiring own the rendering and
// the `selectFrame` callback.
//
// Why a breadcrumb at all: when a nested frame is fully tiled by its
// children there is no empty pixel to click for the container itself, so
// spatial selection can't reach it. The trail is hierarchy-based, so it
// reaches any covering ancestor regardless of how packed the frame is.

import type { Document as AgocraftDocument, Item as AgocraftItem } from "@agocraft/core";
import { findTrailDeep } from "../agocraft-mirror.js";

export interface BreadcrumbSegment {
  /** The ancestor (or self) frame id, stringified. Feed straight into
   *  `selectionContext.selectFrame(id)`. */
  readonly id: string;
  /** Human-facing label — see `segmentLabel` for the fallback chain. */
  readonly label: string;
  /** True for the last segment (the currently-selected item). The bar
   *  marks it `aria-current` and de-emphasises it; clicking it re-selects
   *  the same id (harmless no-op). */
  readonly isCurrent: boolean;
}

// Localised names for the common kinds, used only when an item carries no
// human label of its own. Unknown kinds fall through to the raw kind
// string so a new domain kind still renders *something* readable.
const KIND_LABEL_KO: Readonly<Record<string, string>> = {
  frame: "프레임",
  text: "텍스트",
  image: "이미지",
  video: "비디오",
  shape: "도형",
  line: "선",
  chart: "차트",
  group: "그룹",
};

/** DR-137 §라벨 — richest fallback chain (superset of
 *  `layer-picker.frameLabel` and `hover-describer.itemLabel`): an explicit
 *  label first, then any title-like attr, then a localised kind name, then
 *  the raw kind. Consolidating the three call sites into one `itemLabel`
 *  source is deferred (WI-214 follow-up) to keep this change's blast
 *  radius off the existing hover-describer tests. */
function segmentLabel(item: AgocraftItem): string {
  const attrs = item.attrs as {
    label?: unknown;
    title?: unknown;
    heading?: unknown;
    caption?: unknown;
    summary?: unknown;
  };
  for (const candidate of [attrs.label, attrs.title, attrs.heading, attrs.caption, attrs.summary]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  }
  return KIND_LABEL_KO[item.kind] ?? item.kind;
}

/** Build the breadcrumb segments for `selectedId`.
 *
 *  Returns `[]` when:
 *   - `selectedId` is null/undefined or not found in the tree, OR
 *   - the trail has fewer than 2 entries (a top-level frame has no
 *     navigable ancestor — DR-137 §게이트). The caller hides the bar on an
 *     empty result, so the breadcrumb only appears for genuinely nested
 *     selections — exactly the "packed container" case WI-214 targets.
 *
 *  The synthetic document root is never a segment (`findTrailDeep` already
 *  excludes it). */
export function buildBreadcrumb(
  doc: AgocraftDocument,
  selectedId: string | null | undefined,
): ReadonlyArray<BreadcrumbSegment> {
  if (selectedId === null || selectedId === undefined) return [];
  const trail = findTrailDeep(doc, selectedId);
  if (trail === undefined || trail.length < 2) return [];

  const lastIndex = trail.length - 1;
  return trail.map((item, i) => ({
    id: String(item.id),
    label: segmentLabel(item),
    isCurrent: i === lastIndex,
  }));
}
