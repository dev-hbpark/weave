# DR-048 — normalize LayoutSpec padding (fix onChildAdd crash on padding-less layouts)

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (bug fix, no WI)
- **Relates:** WI-020 / WI-043 (frame layout), DR-046 (agent chart/visual surface — the visual-richness push made the agent set more layouts)

## Context

After the stale-build issue cleared, a real runtime crash surfaced when the agent added a
**frame child into a parent that has an auto-flex / auto-grid layout**:

    TypeError: Cannot read properties of undefined (reading 'left')
      at onParentResize (@agocraft/layout)   ← reads spec.padding.left
      at onChildAdd (@agocraft/layout)
      at weave.item.add (commands.ts)

Root cause: in `@agocraft/core`, `AutoFlexSpec.padding` / `AutoGridSpec.padding` are REQUIRED,
and `@agocraft/layout`'s `onParentResize` dereferences `spec.padding.left` UNGUARDED. But the
agent schema marks `padding` optional and the agent omits it; `weave.frame.setLayout`
(the kit's `createSetFrameLayoutCommand`) stored the raw spec as-is, so `spec.padding` was
`undefined` → the next `onChildAdd` crashed.

## Decision

Normalize every `LayoutSpec` through the core factories (`createAutoFlexSpec` /
`createAutoGridSpec`), which overlay caller fields onto the complete DEFAULT spec (zeroed
padding, gaps, tracks), at two points:

1. **On set** — wrap `weave.frame.setLayout` so the stored layout always carries `padding`
   (and the other required fields). The persisted data is clean.
2. **On child add** — normalize the parent's layout before passing it to
   `getLayoutEngine().onChildAdd(...)`, guarding ANY parent (even a layout stored before #1
   landed, or via another path).

No change to the vendored `@agocraft/layout` (would be lost on re-vendor); the fix lives in
weave's command layer.

## Scope (edits)

- `apps/web/src/document/commands.ts` — `normalizeLayoutSpec` helper; `setFrameLayout` wrapped to
  normalize on store; `weave.item.add` normalizes the parent layout before `onChildAdd`. Imports
  `createAutoFlexSpec` / `createAutoGridSpec` + `LayoutSpec` type.
- `apps/web/src/document/commands-layout-relayout.test.ts` — regression test: a parent layout
  stored WITHOUT padding + a child add must not throw.

## Verification

biome clean; apps/web recursive typecheck green; 503 document/aku unit tests pass (the new
regression test runs with the layout flag on, so the engine actually executes).

## Consequences

- Agent-built decks that set auto-flex / auto-grid layouts (the common path under the
  nested-layout + visual-richness rules) no longer crash on child add.
- Layouts are stored complete (padding/gap/tracks), so onFrameChanged / reflow paths are also
  safe for newly-set layouts.
