// WI-166 / DR-114 — canvas-board (coming-soon, WI-165): present from P1 so
// the registry Record stays exhaustive (tsc forces a decision per flavor —
// DR-114 §6-G1). Current behavior = mixed pieces verbatim; productization
// edits THIS file only (expected divergence sketched in DR-114 §7 — e.g.
// rail-less board), never a consumer.

import { FREE_CAMERA } from "../pieces/camera.js";
import { DOC_ROOT_HIT } from "../pieces/hit-resolution.js";
import { ROOT_INSERTION } from "../pieces/insertion.js";
import { ALL_ELEMENTS_ROLES } from "../pieces/item-roles.js";
import { OVERVIEW_RAIL } from "../pieces/rail.js";
import { ALL_FRAMES_VIEW } from "../pieces/view-frames.js";
import type { EditorModeContext } from "../types.js";

export const CANVAS_BOARD_MODE: EditorModeContext = {
  mode: "infinite",
  roles: ALL_ELEMENTS_ROLES,
  view: ALL_FRAMES_VIEW,
  camera: FREE_CAMERA,
  insertion: ROOT_INSERTION,
  rail: OVERVIEW_RAIL,
  hit: DOC_ROOT_HIT,
};
