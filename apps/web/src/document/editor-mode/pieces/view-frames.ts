// WI-166 / DR-114 — ViewPolicy pieces: which top-level frames render and
// whether the page reads as chrome (matte / clip / active-page tracking).
//
// Pure functions + frozen data only. Consumers never import this file
// (DR-114 §2b) — they receive a composed ViewPolicy via injection.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { ViewPolicy } from "../types.js";

/** Free placement: every top-level frame renders (`undefined` = no scoping
 *  — the WI-153 sentinel FrameStage already understands). */
export function allFramesVisible(): undefined {
  return undefined;
}

/** Page-bounded: exactly the active page renders; nothing while no page is
 *  active (empty presentationOrder edge — same shape the DesignPage memo
 *  produced before absorption). */
export function activePageOnly(
  _doc: AgocraftDocument,
  activePageId: string | undefined,
): ReadonlySet<string> | undefined {
  return activePageId === undefined ? undefined : new Set([activePageId]);
}

/** ViewPolicy for free-placement flavors (mixed / canvas-board): all frames,
 *  no page chrome, viewport culling armed (frames live far off-screen —
 *  WI-058). */
export const ALL_FRAMES_VIEW: ViewPolicy = {
  visibleFrames: allFramesVisible,
  pageChrome: false,
  viewportCulling: true,
};

/** ViewPolicy for page-bounded flavors (slide-deck / doc-page): one page at
 *  a time with matte + clip chrome; culling is pointless for a single
 *  on-screen page. */
export const ACTIVE_PAGE_VIEW: ViewPolicy = {
  visibleFrames: activePageOnly,
  pageChrome: true,
  viewportCulling: false,
};
