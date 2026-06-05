// DR-058 — global "is a history replay applying" flag.
//
// A tiny module-level store (the `cropping-state` / `isCroppingNow()` pattern):
// an imperative read for non-React gates. The changeStream sink in
// `use-weave-editor.ts` records the origin kind of the most-recent applied
// change; DOM-derived geometry consumers (TextBlock's auto-fit ResizeObserver,
// which fires async after a replay's reflow) read `isHistoryReplaying()` at fire
// time and skip a redundant re-commit that would otherwise clear the redo stack.
//
// The flag mirrors the SINGLE editor session on the page (same single-session
// assumption as `cropping-state`). It stays "system" only until the next applied
// change, so the user action immediately following an undo/redo flips it back to
// a live origin before that action's own observer fires.

let lastAppliedOriginKind: string | null = null;

/** Called by the render changeStream sink for every applied change. */
export function noteAppliedChangeOrigin(kind: string): void {
  lastAppliedOriginKind = kind;
}

/** True while the most-recently applied document change was a history replay
 *  (`ChangeOrigin.kind === "system"`), i.e. an undo or redo. */
export function isHistoryReplaying(): boolean {
  return lastAppliedOriginKind === "system";
}
