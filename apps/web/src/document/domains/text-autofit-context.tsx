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

export type RequestTextRefit = (req: TextRefitRequest) => void;

const TextRefitContext = createContext<RequestTextRefit | null>(null);

export const TextRefitProvider = TextRefitContext.Provider;

/** The system-origin refit channel, or null when no provider is mounted (tests /
 *  present-only trees) — callers then fall back to their normal update path. */
export function useTextRefit(): RequestTextRefit | null {
  return useContext(TextRefitContext);
}
