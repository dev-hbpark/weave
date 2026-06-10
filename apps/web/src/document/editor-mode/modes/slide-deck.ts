// WI-166 / DR-114 — slide-deck: Canva-style page-bounded editing, one page
// (stage) at a time. Composition only — pick pieces, no logic (DR-114 §2).

import { ROOT_STAGE_ROLES } from "../pieces/item-roles.js";
import type { EditorModeContext } from "../types.js";

export const SLIDE_DECK_MODE: EditorModeContext = {
  mode: "page-bounded",
  roles: ROOT_STAGE_ROLES,
};
