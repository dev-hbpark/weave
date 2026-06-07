# DR-086 — Reparent preserves a ratio fontSize's visual size (command-level re-base)

- **Date:** 2026-06-07 · **Status:** Accepted · **WI:** WI-135 · **Relates:** DR-082 (px↔ratio guard), agocraft `resolve-font-size`

## Context

`fontSizeSpec.kind:'ratio'` resolves to `value × parentHeightPx`
(`resolve-font-size.ts`). `weave.item.reparent` preserves an item's on-screen
BOX (`computeReparentFrameRatio`) and its own description promises "preserving
its on-screen position" — but the kit command does NOT touch the font. So moving
a ratio-text into a different-height parent kept the box while the glyphs
re-resolved against the new parent: a box↔font mismatch. `px`-kind fonts were
already correct (absolute). Reproduced: A(h 0.25) → B(h 0.5) doubled a ratio
font (54px → 108px) while px stayed 30px.

Operator decision (2026-06-07): **preserve visual size** — a reparent is a move,
not a resize, so the on-screen font px must stay (consistent with px-kind + the
preserved box). The fix must cover **every** path, including the raw
`weave.item.reparent` exec used by the Aku agent tool and programmatic callers
(operator follow-up: "raw … 도 재기준화 해줘").

## Decision

Re-base the ratio value so the rendered px is preserved:

```
newValue = oldValue × oldParentHeightRatio / newParentHeightRatio
```

(`parentHeightRatio` = product of `frame.height` from the design root down to the
parent; the `designHeight` constant cancels.) Implemented by **wrapping the
`weave.item.reparent` command itself** (commands.ts), so EVERY caller — UI
gesture, the Aku agent tool path, and any programmatic `exec` — is covered, in
the SAME transaction as the reparent (one Cmd+Z). No agocraft change / re-vendor.

- `reparent-font.ts` — `computeRatioFontReparentUpdates(doc, entries)` (pure) +
  `ratioFontReparentPatches(doc, entries, basePatches)` which builds the
  `item.attrs` patches to APPEND to the kit command's base patches.
- The wrapper's `run()` calls the kit reparent, then appends the font patches.
  Each font patch reads the moved item's FINAL attrs after the base patches (a
  layout new-parent emits an `item.attrs` for the moved item; otherwise the new
  frame comes from the `item.reparent` entry) and differs from it ONLY in
  `fontSizeSpec` — so it never clobbers the frame, for absolute and layout
  parents alike, and self-inverts cleanly (single-transaction undo).
- `agocraft-mirror.ts`: `frameHeightRatio(doc, frameId)` (frame height as a
  fraction of the design height).

### Why the command wrapper

A gesture-level helper would miss the raw exec / agent path. The agocraft
`createReparentCommand` exposes no attr-conversion hook, and `item.attrs` patches
REPLACE attrs wholesale — but the wrapper sidesteps that by reading the post-base
FINAL attrs and flipping only `fontSizeSpec`. Threading a core attr hook +
symmetric undo-inversion through the `item.reparent` patch would be a
disproportionate core change; the wrapper needs neither and keeps one-step undo.

## Consequences

- (+) Moving a ratio-text between frames keeps its on-screen size on EVERY path
  (gesture, agent, programmatic) — the "preserve position" contract holds for
  both kinds.
- (+) One Cmd+Z restores both the move and the value re-base (single transaction).
- (−) `weave.item.reparent` is now a thin weave wrapper over the kit command
  (one extra `run` indirection); `dissolveFrame` (frame delete → children rise)
  is NOT wrapped (separate gesture) and keeps the old behavior — documented.

## Verification

- Unit `reparent-font.test.ts` (3) — re-base math, px ignored, no-op on equal height.
- weave e2e `fontsize-reparent.spec.ts` (3): the RAW command preserves ratio
  (54→54) + px (30→30); one Cmd+Z restores parent + value 0.2; the agent /
  programmatic raw-exec path is preserved too.
- No regression: existing reparent e2e + `commands.test.ts`.
