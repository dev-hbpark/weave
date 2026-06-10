// WI-166 P4 / DR-114 — InputPolicy piece: which FSM modes admit each
// pointer-affordance gate. Absorbs the hardcoded mode lists that lived in
// the interaction-mode.tsx gate hooks; the hooks now look these tables up
// from the injected policy. The FSM itself (transition logic, claim-token
// bookkeeping) stays a single flavor-independent machine.
//
// One shared piece for all four flavors: today no gate set varies by
// flavor — page-bounded flavors simply never REACH `hand` / `panning`
// because the hand tool only arms when `CameraPolicy.dragPan` is true
// (P2), so keeping those modes in the sets is inert there and keeps the
// piece a faithful no-behavior-change move of the old hook bodies. The
// first flavor that needs a different admissible set forks a new piece;
// consumers (the hooks) are untouched.
//
// Pure frozen data only. Consumers never import this file (DR-114 §2b).

import type { InputPolicy } from "../types.js";

/** The gate tables every flavor composes today — a 1:1 transcription of
 *  the pre-P4 hook bodies (see each gate's rationale on the hook docs in
 *  interactions/interaction-mode.tsx):
 *    · tooltips           — idle | hand (hover hints survive the pan tool).
 *    · frameSelection     — idle only (every other mode owns the pointer
 *                           flow or carries its own selection semantics).
 *    · editAffordances    — idle only (WI-040; the peek axis stays in the
 *                           hook — product surface, not flavor policy).
 *    · selectionChrome    — idle | frame-manipulating | text-editing
 *                           (handles persist mid-drag and during text edit).
 *    · frameDragBindings  — everything except hand / panning / context-menu.
 *                           Allow-list form of the old block-list — see the
 *                           InteractionGateKey doc in types.ts for the
 *                           new-mode caveat (modes entered BY these
 *                           bindings' own claims must stay admitted). */
export const STANDARD_INPUT: InputPolicy = {
  gates: {
    tooltips: new Set(["idle", "hand"]),
    frameSelection: new Set(["idle"]),
    editAffordances: new Set(["idle"]),
    selectionChrome: new Set(["idle", "frame-manipulating", "text-editing"]),
    frameDragBindings: new Set(["idle", "rubber-band", "frame-manipulating", "text-editing"]),
  },
};
