// WI-166 / DR-114 — slide-deck: Canva-style page-bounded editing, one page
// (stage) at a time. Composition only — pick pieces, no logic (DR-114 §2).

import { PAGE_AGENT_SURFACE } from "../pieces/agent-surface.js";
import { ACTIVE_PAGE_CAMERA } from "../pieces/camera.js";
import { ACTIVE_PAGE_HIT } from "../pieces/hit-resolution.js";
import { STANDARD_INPUT } from "../pieces/input.js";
import { ACTIVE_PAGE_INSERTION } from "../pieces/insertion.js";
import { ROOT_STAGE_ROLES } from "../pieces/item-roles.js";
import { PAGE_LIFECYCLE_RAIL } from "../pieces/rail.js";
import { ACTIVE_PAGE_VIEW } from "../pieces/view-frames.js";
import type { EditorModeContext } from "../types.js";

export const SLIDE_DECK_MODE: EditorModeContext = {
  mode: "page-bounded",
  roles: ROOT_STAGE_ROLES,
  view: ACTIVE_PAGE_VIEW,
  camera: ACTIVE_PAGE_CAMERA,
  insertion: ACTIVE_PAGE_INSERTION,
  rail: PAGE_LIFECYCLE_RAIL,
  hit: ACTIVE_PAGE_HIT,
  input: STANDARD_INPUT,
  agent: PAGE_AGENT_SURFACE,
};
