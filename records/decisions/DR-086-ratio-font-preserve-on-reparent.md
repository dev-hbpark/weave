# DR-086 — Reparent preserves a ratio fontSize's visual size (gesture-path re-base)

- **Date:** 2026-06-07 · **Status:** Accepted · **WI:** WI-135 · **Relates:** DR-082 (px↔ratio guard), agocraft `resolve-font-size`

## Context

`fontSizeSpec.kind:'ratio'` resolves to `value × parentHeightPx`
(`resolve-font-size.ts`). `weave.item.reparent` preserves an item's on-screen
BOX (`computeReparentFrameRatio`) and its own description promises "preserving
its on-screen position" — but the raw command does NOT touch the font. So moving
a ratio-text into a different-height parent kept the box while the glyphs
re-resolved against the new parent: a box↔font mismatch. `px`-kind fonts were
already correct (absolute). Reproduced: A(h 0.25) → B(h 0.5) doubled a ratio
font (54px → 108px) while px stayed 30px.

Operator decision (2026-06-07): **preserve visual size** — a reparent is a move,
not a resize, so the on-screen font px must stay (consistent with px-kind + the
preserved box). (The alternative — treat ratio as "fraction of the *current*
parent", responsive — was rejected for the move gesture.)

## Decision

On the reparent GESTURE, re-base the ratio value so the rendered px is preserved:

```
newValue = oldValue × oldParentHeightRatio / newParentHeightRatio
```

(`parentHeightRatio` = product of `frame.height` from the design root down to the
parent; the `designHeight` constant cancels.) Implemented weave-side, **without
touching the agocraft kit command** (no core re-vendor):

- `reparent-font.ts` — `computeRatioFontReparentUpdates(doc, entries)` (pure) +
  `reparentPreservingRatioFont(editor, doc, entries, designSize)` which runs the
  reparent and a follow-up `weave.item.update` (per ratio-text) inside ONE
  `editor.runBatch` transaction.
- The follow-up update runs AFTER the reparent, so it reads the moved item's
  POST-reparent attrs (new frame intact) and merges only `fontSizeSpec` — no
  frame clobber; works for absolute and layout parents.
- Wired into the two UI reparent gestures: `use-reparent-drag-controller`
  (drag-to-reparent) and `DesignPage` (layer/context-menu reparent).

### Why weave-side, not the kit command

The agocraft `createReparentCommand` exposes `computeFrameRatio` + a layout hook
but no attr-conversion hook, and `item.attrs` patches REPLACE attrs wholesale —
a post-reparent font patch there would clobber the new frame, and threading a
core hook + symmetric undo-inversion through `item.reparent` is a disproportionate
core change. `runBatch` gives one-undo composition with a clean merge.

### Scope / known gap

Covers the manual gestures (the operator's "부모프레임이동"). The **raw**
`weave.item.reparent` exec (the Aku agent's tool path, programmatic callers) is
NOT re-based — agent reparenting ratio-text between different-height frames is
rare. A universal fix would need an agocraft attr-conversion hook + re-vendor;
deferred unless the agent path shows the issue.

## Consequences

- (+) Dragging/moving a ratio-text between frames keeps its on-screen size — the
  "preserve position" contract now holds for both kinds.
- (+) One Cmd+Z restores both the move and the value re-base (single transaction).
- (−) Behavior split: gesture path re-bases, raw command does not. Documented.

## Verification

- Unit `reparent-font.test.ts` (3) — re-base math, px ignored, no-op on equal height.
- weave e2e `fontsize-reparent.spec.ts` (4): gesture preserves ratio (54→54) +
  px (30→30); one Cmd+Z restores parent + value 0.2; contrast test shows the raw
  command still ×2.
