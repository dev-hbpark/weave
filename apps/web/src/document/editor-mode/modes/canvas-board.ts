// WI-166 / DR-114 — canvas-board (coming-soon, WI-165): present from P1 so
// the registry Record stays exhaustive (tsc forces a decision per flavor —
// DR-114 §6-G1). Current behavior = mixed pieces verbatim; productization
// edits THIS file only (expected divergence sketched in DR-114 §7 — e.g.
// rail-less board), never a consumer.

import { ALL_ELEMENTS_ROLES } from "../pieces/item-roles.js";
import type { EditorModeContext } from "../types.js";

export const CANVAS_BOARD_MODE: EditorModeContext = {
  mode: "infinite",
  roles: ALL_ELEMENTS_ROLES,
};
