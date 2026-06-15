// WI-237/238 — measurement→engine channel for text auto-fit (DR-152/153).
//
// TextBlock measures its content vs its box in the DOM and REPORTS the raw numbers;
// the provider (DesignPage) decides what to do based on the item's REAL parent
// layout (resolved from the live doc), then feeds the resize to the engine:
//   • parent is auto-grid → grow the GRID FRAME (the cell's height is the track's).
//   • else (flex / absolute) → correct the text's OWN frame.height.
// Routing lives in the provider (not TextBlock) so it is correct regardless of the
// child's own `layoutChild` — which can be STALE after a reparent into a grid
// (WI-238 follow-up: the reparented text kept a non-grid policy and auto-fit missed).

import { createContext, useContext } from "react";
import type { ItemFrame } from "../types.js";

export interface TextFitReport {
  readonly itemId: string;
  /** The engine box height (clientHeight) in px. */
  readonly boxPx: number;
  /** The content's intrinsic height (scrollHeight) in px. */
  readonly contentPx: number;
  /** The text item's current frame (for the text-refit `after`, and its height ratio). */
  readonly currentFrame: ItemFrame;
}

export type RequestTextFit = (report: TextFitReport) => void;

const TextFitContext = createContext<RequestTextFit | null>(null);

export const TextFitProvider = TextFitContext.Provider;

/** The auto-fit report channel, or null when no provider is mounted (tests /
 *  present-only trees) — TextBlock then does nothing. */
export function useTextFit(): RequestTextFit | null {
  return useContext(TextFitContext);
}
