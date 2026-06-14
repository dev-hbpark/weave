// WI-194 / DR-127 — DeckPolicy pieces: WHAT the deck (rail tiles + present
// steps + present scenes) is made of, per flavor. RailPolicy (rail.ts) says
// HOW the rail behaves; this says WHICH frames are in it.
//
// PAGE_DECK is the read-time structural filter that implements "only frames
// added AS pages are slides; frames inside a page are groups": candidates =
// root-direct frames only, `presentable` deliberately IGNORED (structure is
// the meaning — honoring a stale mixed-era `presentable: false` stamp would
// create an invisible page with no recovery UI, since the page-lifecycle
// rail has no deck toggle). FULL_DECK keeps the WI-072 mixed model intact.
//
// Pure frozen data only. Consumers never import this file (DR-114 §2b).

import {
  collectNonSlideFrameIds,
  collectPresentationIds,
  collectRootPageIds,
  isPresentableFrame,
} from "../../presentation-order.js";
import type { DeckPolicy } from "../types.js";

/** Deck for free-placement flavors (mixed / canvas-board) — the WI-072
 *  model unchanged: every frame at any depth is a deck candidate unless the
 *  user opted it out (`presentable: false`); opted-out top-level frames
 *  still get their own present scene (link targets). */
export const FULL_DECK: DeckPolicy = Object.freeze({
  collectCandidateIds: collectPresentationIds,
  childOwnsScene: isPresentableFrame,
  collectNonStepSceneIds: collectNonSlideFrameIds,
  // Free placement: z-order context. An above scene would occlude the active
  // frame → hide it; a below scene is soft background → blur it.
  sceneVisibility: (position: "above" | "below") => (position === "above" ? "hidden" : "blur"),
});

const NO_IDS: ReadonlyArray<string> = Object.freeze([]);

/** Deck for page-bounded flavors (slide-deck / doc-page) — page = artboard
 *  = slide: root-direct frames only. Nested frames never own a scene, so
 *  PresentFrameTree renders them INLINE in their page's scene (skipping
 *  them like FULL_DECK does would punch holes in slides), and there is no
 *  non-step scene set. */
export const PAGE_DECK: DeckPolicy = Object.freeze({
  collectCandidateIds: collectRootPageIds,
  childOwnsScene: () => false,
  collectNonStepSceneIds: () => NO_IDS,
  // Page-bounded: each slide is a self-contained full-bleed page. There is no
  // z-order context to read, so non-active scenes are simply hidden (no blur)
  // and the active slide shows cleanly — unlike the mixed model's blur/hide.
  sceneVisibility: () => "hidden",
});
