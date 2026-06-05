# DR-056 — Two-tier undo ownership for text editing (Lexical intra-edit, weave post-edit)

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-029 (Phase 2 follow-up)
- **Relates:** DR-015 (Lexical adoption), C1 fix (`LexicalTextEditor` onChange
  signature guard — range-format commits now flow through `weave.item.update`),
  `apps/web/CLAUDE.md` "Document mutation rule — every change goes through History",
  DR-017 ADR-D (drag auto-merge / `historyMergeWindowMs: 500`)

## Context

The project History contract (`CLAUDE.md`) requires every document mutation to
flow through `editor.exec("weave.<verb>")` → `editor.history`, and "an e2e test
covers `Cmd+Z` reverting that mutation". Text editing has two undo stacks in
play and the contract was only **implicitly** satisfied, with no test:

1. **Lexical's `<HistoryPlugin/>`** owns Cmd+Z/Cmd+Shift+Z **while a text item is
   focused** (contenteditable). The editor-hotkey registry's action wrapper
   (`editor-hotkeys.ts:1120`) early-returns for `isTextEditingTarget(...)`, so
   `editor.history.undo()` does **not** run while editing — Lexical handles it.
   This gives caret-level (per-keystroke / per-format) undo inside an edit
   session, which is the correct editor UX.
2. **weave `editor.history`** owns Cmd+Z **outside** edit mode. Every meaningful
   `onChange` commits `{text, textRuns}` through `weave.item.update`
   (`DesignPage.updateItem` → `editor.exec`), and `mergeKeyOf` +
   `historyMergeWindowMs: 500` fold a rapid typing burst into one undo entry.

Two real gaps:

- **No coverage.** The mandated "Cmd+Z reverts the mutation" e2e never existed
  for text or for range formatting. The R4 Cmd+B/I/U specs are `test.fixme`
  (Playwright can't synthesize Lexical's `beforeinput`), so the undo path was
  entirely unverified.
- **The ownership boundary was undocumented**, so it read as "range formatting
  bypasses the History contract." With the C1 fix in place (a format-only
  change now fires `onChange` → commits a real `Patch`), range formatting **does**
  land in `editor.history` like any other attrs edit — but nothing said so.

## Decision

Adopt and **document** a two-tier undo model; do not collapse the two stacks.

- **Intra-edit (text item focused):** Lexical's HistoryPlugin owns Cmd+Z /
  Cmd+Shift+Z. weave history is intentionally not touched (the registry's
  text-target guard already enforces this). Rationale: per-keystroke /
  per-format undo is editor-local UX; pushing each into the document stack would
  make a single sentence cost dozens of document-level Cmd+Z.
- **Post-edit (no text focus):** weave `editor.history` owns Cmd+Z. A text edit
  session collapses to ~one entry per typing burst via the existing 500ms
  `item.attrs#<id>` merge window. Cmd+Z reverts text **and** inline range
  formatting (both ride the same `weave.item.update` patch after the C1 fix);
  Cmd+Shift+Z re-applies.
- **Keep live per-keystroke commits.** The model stays current during editing
  (relied on by `text-edit-entry.spec.ts`, autosave, and any agent reading the
  live doc). We do **not** switch to commit-at-edit-exit.

## Consequences

- (+) The History contract is now explicitly satisfied for text: range
  formatting and text both undo/redo through `editor.history` post-edit, and the
  intra-edit stack is a documented, intentional Lexical-owned tier.
- (+) Closes the coverage gap for the **undo** half: a new e2e
  (`e2e/history-text.spec.ts`) types into a text item, exits, and asserts Cmd+Z
  reverts the text through `editor.history`. (The Cmd+B range-format undo remains
  `test.fixme` for the Playwright `beforeinput` reason; its commit path is
  unit-covered by `LexicalTextEditor.test.ts` after C1.)
- (+) The redo half (`Cmd+Shift+Z re-applies`) was initially blocked by a
  separate pre-existing issue (C4 below); **resolved by DR-058**, so the redo
  test is now enabled and passing.
- (−) **Known edge — undo-while-editing desync.** If the user pauses >500ms,
  presses Cmd+Z *while still editing* (a Lexical undo that fires a forward weave
  commit), then exits, a subsequent document-level Cmd+Z can resurrect the
  pre-undo content. This is inherent to embedding an editor that keeps its own
  history alongside a document history. Accepted as a narrow edge for v1.

## Discovered while writing the contract test — auto-fit re-commit clears redo (C4)

A text item in an **auto-size mode** (auto-width / auto-height — the default)
recomputes its `frame` via the auto-fit `ResizeObserver` (`TextBlock.tsx`). When
an **undo** reverts the text content, the rendered content size changes, the
observer fires, and it commits the new size as a fresh `weave.item.update`
(`user-command` origin) — which **clears the redo stack**. Verified by
diagnostics: immediately after the undo, `history.canRedo()` is already `false`
and the auto-width frame re-commits (width `0.428 → 0.312`). Net effect:
`Cmd+Shift+Z` cannot re-apply a text edit on an auto-sized box.

This is independent of the C1/C2/C3 text work — it is how **auto-derived
geometry** interacts with history. **Resolved by DR-058**: the auto-fit observer
skips its commit while the most-recent applied change is a history replay
(`isHistoryReplaying()`), so the redo stack survives. The redo e2e is enabled.
(The deeper end-state — auto-fit geometry recomputed and never persisted as an
independent undoable entry — remains possible future work but is no longer needed
for the contract.)

## Future work (not in this DR)

A **session-scoped merge namespace** would eliminate the edge: tag every commit
within one edit session with a stable key so the whole session is always exactly
one weave entry regardless of pauses, and intra-edit Lexical-undo forward-commits
fold into it. This requires extending agocraft's `Patch` type with an explicit
merge namespace (see `commands.ts:618-621`), i.e. a vendored-dependency change —
out of scope here. Tracked for a future WI.
