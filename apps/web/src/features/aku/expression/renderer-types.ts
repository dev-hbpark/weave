// 아쿠 expression — renderer seam (WI-103 / DR-070 D2).
//
// Strategy / DIP, mirroring the AkuTransport seam: the expression layer depends
// ONLY on this interface, never on a concrete renderer. Phase 1 ships
// `createCssSpriteRenderer` (no dependency — CSS sprite `steps()` + transform).
// A future `createRiveRenderer` (deferred behind library-adoption-review, FR-020)
// drops in here with ZERO change to mood.ts / use-aku-expression.ts (Protected
// Variations). The deps-guard test asserts the consumer layer keeps that purity.

import type { ReactNode } from "react";
import type { AkuMood } from "./mood.js";

/** The resolved character state handed to a renderer. */
export interface AkuExpressionState {
  readonly mood: AkuMood;
  /** Animation vigor 0..1 (renderer maps it to speed/amplitude as it sees fit). */
  readonly intensity: number;
}

/** Renders the animated mascot for a given expression state. The returned node is
 *  the launcher's INNER content (the button box stays put for anchor stability —
 *  AkuLauncher contract); the renderer owns only the animated wrapper + mascot. */
export interface AkuExpressionRenderer {
  render(state: AkuExpressionState): ReactNode;
}
