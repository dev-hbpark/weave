// WI-166 / DR-114 — doc-page (coming-soon, WI-165): present from P1 so the
// registry Record stays exhaustive (tsc forces a decision per flavor —
// DR-114 §6-G1). Current behavior = slide-deck pieces verbatim;
// productization edits THIS file only (expected divergence sketched in
// DR-114 §7 — e.g. vertical page stack, "flow-block" role), never a
// consumer.

import { ROOT_STAGE_ROLES } from "../pieces/item-roles.js";
import type { EditorModeContext } from "../types.js";

export const DOC_PAGE_MODE: EditorModeContext = {
  mode: "page-bounded",
  roles: ROOT_STAGE_ROLES,
};
