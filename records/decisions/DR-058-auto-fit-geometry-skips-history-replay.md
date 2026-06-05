# DR-058 — Auto-fit geometry does not re-commit during a history replay

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-029 (Phase 2 follow-up)
- **Relates:** DR-056 (text undo ownership — discovered this as "C4"), DR-016 /
  WI-029 (text auto-height), WI-019 (auto-width), `apps/web/CLAUDE.md`
  "Document mutation rule"

## Context / bug

A text item in an **auto-size mode** (auto-width / auto-height — the default)
tracks its content with a `ResizeObserver` in `TextBlock.tsx` and commits the
fitted `frame` through `onUpdate → weave.item.update` (user-command origin).

When the user **undoes** a text edit, the merged history entry atomically
restores both the text and the fitted frame. But the content change then
re-triggers the `ResizeObserver`, which re-measures and commits the size **again**
as a fresh `user-command` `weave.item.update`. That new entry **clears the redo
stack** — so `Cmd+Shift+Z` can no longer re-apply the edit. Verified by
diagnostics: immediately after the undo, `history.canRedo()` is already `false`
and an auto-width re-commit lands (width `0.428 → 0.312`).

Root cause: the auto-fit observer reacts to a DOM size change without knowing
whether that change came from a **live user edit** (must commit) or a **history
replay** (must NOT commit — the replayed patch already set the correct frame).

## Decision

The auto-fit observer **skips its commit while the most-recent applied document
change was a history replay** (`ChangeOrigin.kind === "system"`).

- `use-weave-editor.ts`'s changeStream subscriber already receives every applied
  `Change` with its `origin`. It calls `noteAppliedChangeOrigin(change.origin.kind)`
  **before** applying it.
- `history-replay-state.ts` is a tiny module-level store exposing the imperative
  read `isHistoryReplaying()` (true while the last applied origin was `system`).
  This follows the established `cropping-state` / `isCroppingNow()` pattern in
  this codebase — an imperative gate for non-React consumers, no context
  plumbing through DesignPage's render tree.
- `TextBlock`'s `measureAndCommit` early-returns when `isHistoryReplaying()` is
  true. The observer fires async (after the replay's reflow), and the flag
  persists until the next applied change, so the read at fire time is correct.

Why this is correct and sufficient:

- During undo/redo the frame is **already** restored by the replayed patch, so
  the auto-fit commit is redundant — skipping it loses nothing and preserves the
  redo stack.
- The flag is read at observer **fire time** (async, after the replay's reflow),
  so it must persist past `applyChange`. It stays `true` only until the next
  applied change; the immediately-following user action flips it back to
  `user-command` before that action's own observer fire, so live auto-fit
  (typing-exit, edge-resize) still commits.

Alternatives considered:

- **mergeKey the auto-fit commit** (fold it into the prior entry): masks the
  symptom, doesn't stop the redo-clear, and risks swallowing legitimate
  consecutive auto-fits.
- **Value-dedupe in the observer** (skip if frame equals last-applied): fragile
  against measurement epsilon and doesn't distinguish replay from a real reflow.
- **Remove auto-fit geometry from history entirely** (recompute, never persist):
  the cleanest end-state but a large refactor — frame dimensions are read by
  layout, selection chrome, and persistence. Deferred; the origin-skip is the
  minimal correct fix.

## Consequences

- (+) `Cmd+Z` then `Cmd+Shift+Z` round-trips a text edit on auto-sized boxes —
  the redo half of the DR-056 contract now passes (`history-text.spec.ts`
  un-`fixme`d).
- (+) Localized: one module store (`history-replay-state.ts`), one line in the
  `use-weave-editor.ts` sink, one guard line in `TextBlock`. No DesignPage / props
  / context / command-signature changes; the History mutation rule is unchanged
  (live auto-fit still goes through `editor.exec`).
- (−) Single-session assumption: the flag is module-global (same limitation as
  `cropping-state`). Fine for the one-editor-per-page app.
- (−) Narrow gap: in the window between an undo/redo and the next document
  change, a non-document reflow (e.g. a window resize) will not trigger an
  auto-fit re-commit. Harmless in practice — the frame is stored as a **ratio**
  of the parent, so a pure viewport resize needs no re-fit.

## Verification

- `e2e/history-text.spec.ts` — the previously-`fixme` redo test
  ("Cmd+Shift+Z re-applies the edit") is enabled and passes.
- Existing auto-width / auto-height e2e (`text-item.spec.ts`) stay green — live
  fitting is unaffected (last origin is `user-command` during edits).
