// WI-237 iteration 3 — system-origin channel for text auto-fit (DR-152).
//
// Iteration 2 fed the refit through `onUpdate` → `weave.item.update` (a USER-command:
// undoable + a history entry per fit). Iteration 3 routes it through this context to
// `editor.applySystemPatches` instead: origin.kind === "system" → NOT in undo history
// (Cmd+Z never reverts an auto-fit), and bursts are coalesced into one transaction.
// The change still persists/syncs (the box must), just invisibly to the user's undo.

import { createContext, useContext } from "react";
import type { ItemFrame } from "../types.js";

export interface TextRefitRequest {
  readonly itemId: string;
  /** Current frame (the patch's `before`, for a correct inverse). */
  readonly before: ItemFrame;
  /** Frame with the refit height (the patch's `after`). */
  readonly after: ItemFrame;
}

export interface TextRefitChannel {
  /** Flex/absolute text — correct the text's OWN frame.height (WI-237). */
  readonly refitText: (req: TextRefitRequest) => void;
  /** WI-238 — a GRID cell overflows its track: grow the parent GRID frame
   *  instead (the cell's height is the track's, not its own). `overflowRatio` =
   *  contentPx / cellBoxPx; the provider resolves the parent grid frame. */
  readonly refitGrid: (cellItemId: string, overflowRatio: number) => void;
}

const TextRefitContext = createContext<TextRefitChannel | null>(null);

export const TextRefitProvider = TextRefitContext.Provider;

/** The refit channel, or null when no provider is mounted (tests / present-only
 *  trees) — callers then fall back to their normal update path / no-op. */
export function useTextRefit(): TextRefitChannel | null {
  return useContext(TextRefitContext);
}
