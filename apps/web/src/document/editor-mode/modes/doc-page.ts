// WI-166 / DR-114 — doc-page (coming-soon, WI-165): present from P1 so the
// registry Record stays exhaustive (tsc forces a decision per flavor —
// DR-114 §6-G1). Current behavior = slide-deck pieces verbatim;
// productization edits THIS file only (expected divergence sketched in
// DR-114 §7 — e.g. vertical page stack, "flow-block" role), never a
// consumer.

import { PAGE_AGENT_SURFACE } from "../pieces/agent-surface.js";
import { ACTIVE_PAGE_CAMERA } from "../pieces/camera.js";
import { PAGE_DECK } from "../pieces/deck.js";
import { ACTIVE_PAGE_HIT } from "../pieces/hit-resolution.js";
import { STANDARD_INPUT } from "../pieces/input.js";
import { ACTIVE_PAGE_INSERTION } from "../pieces/insertion.js";
import { ROOT_STAGE_ROLES } from "../pieces/item-roles.js";
import { PAGE_LIFECYCLE_RAIL } from "../pieces/rail.js";
import { ACTIVE_PAGE_VIEW } from "../pieces/view-frames.js";
import type { EditorModeContext } from "../types.js";

export const DOC_PAGE_MODE: EditorModeContext = {
  mode: "page-bounded",
  roles: ROOT_STAGE_ROLES,
  view: ACTIVE_PAGE_VIEW,
  camera: ACTIVE_PAGE_CAMERA,
  insertion: ACTIVE_PAGE_INSERTION,
  rail: PAGE_LIFECYCLE_RAIL,
  deck: PAGE_DECK,
  hit: ACTIVE_PAGE_HIT,
  input: STANDARD_INPUT,
  agent: PAGE_AGENT_SURFACE,
};
