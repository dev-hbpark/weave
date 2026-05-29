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

/** A bundle of design-aware capabilities for one editor instance: a snapshot
 *  reader (for request context) + a name→executor map (Rule 6: dispatch is a
 *  map lookup, never a switch on tool name). */
export interface AkuToolset {
  snapshot(): AkuDocSnapshot;
  readonly executors: ReadonlyMap<string, AkuToolExecutor>;
}
