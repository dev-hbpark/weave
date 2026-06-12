// WI-166 / DR-114 — mixed: Figma-style free-placement infinite canvas.
// Composition only — pick pieces, no logic (DR-114 §2).

import { FREE_AGENT_SURFACE } from "../pieces/agent-surface.js";
import { FREE_CAMERA } from "../pieces/camera.js";
import { FULL_DECK } from "../pieces/deck.js";
import { DOC_ROOT_HIT } from "../pieces/hit-resolution.js";
import { STANDARD_INPUT } from "../pieces/input.js";
import { ROOT_INSERTION } from "../pieces/insertion.js";
import { ALL_ELEMENTS_ROLES } from "../pieces/item-roles.js";
import { OVERVIEW_RAIL } from "../pieces/rail.js";
import { ALL_FRAMES_VIEW } from "../pieces/view-frames.js";
import type { EditorModeContext } from "../types.js";

export const MIXED_MODE: EditorModeContext = {
  mode: "infinite",
  roles: ALL_ELEMENTS_ROLES,
  view: ALL_FRAMES_VIEW,
  camera: FREE_CAMERA,
  insertion: ROOT_INSERTION,
  rail: OVERVIEW_RAIL,
  deck: FULL_DECK,
  hit: DOC_ROOT_HIT,
  input: STANDARD_INPUT,
  agent: FREE_AGENT_SURFACE,
};
