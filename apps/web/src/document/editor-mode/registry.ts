// WI-166 / DR-114 — EDITOR_MODES: flavor → composed editor-mode context.
//
// COMPOSITION-ROOT ONLY (DR-114 §2b): the EditorModeProvider and the
// explicit `editorModeFor` call sites are the only places allowed to
// import this file — consumers receive policies by injection and import
// `types.ts` only (enforced by tools/check_editor_mode_boundary.sh).
//
// Pure static record — no refs, no React (DR-114 v2 change ③): non-React
// consumers (agent retarget, PresentPage) resolve through `editorModeFor`
// and pass mutable state to policy functions as explicit arguments.
//
// Rule 6 — a new flavor is one composition file + one row here, never a
// `switch (flavor)` in a consumer (DR-114 §6-G6).

import type { DocFlavor } from "../types.js";
import { CANVAS_BOARD_MODE } from "./modes/canvas-board.js";
import { DOC_PAGE_MODE } from "./modes/doc-page.js";
import { MIXED_MODE } from "./modes/mixed.js";
import { SLIDE_DECK_MODE } from "./modes/slide-deck.js";
import type { EditorModeContext } from "./types.js";

export const EDITOR_MODES: Readonly<Record<DocFlavor, EditorModeContext>> = {
  mixed: MIXED_MODE,
  "slide-deck": SLIDE_DECK_MODE,
  "canvas-board": CANVAS_BOARD_MODE,
  "doc-page": DOC_PAGE_MODE,
};

/** Resolve the editor-mode context for a (possibly undefined / legacy)
 *  flavor; defaults to `mixed` so an unknown flavor never breaks the
 *  editor (inherited from formatEditorConfig's fallback). */
export function editorModeFor(flavor: DocFlavor | undefined): EditorModeContext {
  return (flavor !== undefined && EDITOR_MODES[flavor]) || EDITOR_MODES.mixed;
}
