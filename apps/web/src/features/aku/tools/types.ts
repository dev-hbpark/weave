// Aku tool registry types (WI-052). Tools are how the design-aware agent reads
// and edits the canvas — each executor delegates to an existing `weave.*`
// command via `editor.exec`, so every edit is an undoable transaction.

import type { AkuDocSnapshot } from "../transport/types.js";

export interface AkuToolResult {
  readonly ok: boolean;
  /** Short human-readable summary, shown as an edit chip in the transcript. */
  readonly summary: string;
}

export type AkuToolExecutor = (input: unknown) => AkuToolResult | Promise<AkuToolResult>;

/** Thin window onto the editor's linear undo stack, so the conversation hook can
 *  measure how many entries a turn added and offer a turn-level "이 변경 되돌리기"
 *  while those edits are still on top of the stack. */
export interface AkuHistoryController {
  /** Current undo-stack depth (number of undoable transactions). */
  depth(): number;
  /** Roll back up to `times` transactions (stops early if the stack empties). */
  undo(times: number): void;
}

/** A bundle of design-aware capabilities for one editor instance: a snapshot
 *  reader (for request context) + a name→executor map (Rule 6: dispatch is a
 *  map lookup, never a switch on tool name) + an undo controller. */
export interface AkuToolset {
  snapshot(): AkuDocSnapshot;
  readonly executors: ReadonlyMap<string, AkuToolExecutor>;
  readonly history: AkuHistoryController;
}
