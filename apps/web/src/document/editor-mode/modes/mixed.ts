// WI-166 / DR-114 — mixed: Figma-style free-placement infinite canvas.
// Composition only — pick pieces, no logic (DR-114 §2).

import { ALL_ELEMENTS_ROLES } from "../pieces/item-roles.js";
import type { EditorModeContext } from "../types.js";

export const MIXED_MODE: EditorModeContext = {
  mode: "infinite",
  roles: ALL_ELEMENTS_ROLES,
};
