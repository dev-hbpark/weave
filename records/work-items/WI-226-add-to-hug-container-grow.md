# WI-226 — Adding a child to an already-Hug container doesn't grow it (follow-up)

## Metadata

| Field | Value |
|---|---|
| ID | WI-226 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | BACKLOG (record-only — deferred by operator, implement later) |
| Type | Bug / structural follow-up (layout / Hug + item.add) |
| Parent | [WI-225](WI-225-px-pinned-auto-layout.md) / [DR-141](../decisions/DR-141-px-pinned-auto-layout.md) (px-pinned auto-layout — covers the common `add → Hug` flow; this is the uncovered `Hug → add` flow) |

## Problem (reproduced, doc-level)

When a container is **already Hug** and a child is **added** to it:
1. the container does **NOT grow** to fit the new child — it keeps its old hugged
   box, so the new child overflows; and
2. a subsequent re-Hug (`setSizing` again) then **shrinks** the container/children.

Repro (doc-level e2e, design 1280×720), `weave.frame.setSizing` Hug both → then
`weave.item.add` a 2nd shape:

| step | R (container) | A | B (added) |
|---|---|---|---|
| after Hug | `{0.09, 0.2}` | fills `{1,1}` | — |
| **after add B** | `{0.09, 0.2}` ← did NOT grow | `{0.15,0.5}` | `{0.3,0.6}` (overflows R) |
| after re-Hug | `{0.0465,0.12}` ← shrank | `{0.29,0.83}` | `{0.58,1}` |

The **common** flow (add all children → set Hug) is fully fixed by WI-225 — the
pin captures every child at Hug time. This WI is only the **Hug → add** ordering.

## Root cause (direction — not yet fixed)

`weave.item.add`'s engine `onChildAdd` arranges the new child but does **not**
re-fit a Hug container's BOX (no `refitHugContainer`), and the new child gets a
ratio `basis` only — **no `sizePx`** pin (the px-pin invariant from DR-141 is not
established on add). So:
- the Hug box isn't recomputed to include the new child, and
- the un-pinned new child re-introduces the ratio↔px circularity on the next op.

## Fix approach (when implemented)

In `weave.item.add` (`apps/web/src/document/commands.ts`, ~860–1098), when the
container is an auto-flex/auto-grid container AND design dims are supplied:
1. stage the new child into the doc (it doesn't exist in `ctx.document` yet — the
   add emits an `item.create` patch), then
2. run `pinAutoLayoutPx` (`document/layout/pin-auto-layout-px.ts`) over the
   container so the NEW child gets `sizePx` + explicit basis/crossSize and the
   container gets/keeps `gapPx`/`paddingPx`, then
3. if the container Hugs an axis, fold in `refitHugContainer` so the box grows to
   fit the new child and the subtree re-arranges — merge the new child's pinned
   policy into its `item.create` payload (`serializeItemSubtree(stagedItem)`), and
   emit the container frame + sibling frame patches.

Mirror the `weave.frame.setSizing` wiring in WI-225 (pin → stage → re-fit; single
merged patches for clean undo). Weave-only — no engine change / re-vendor.

## Verification (when implemented)

Extend `apps/web/e2e/frame-sizing-refit.spec.ts`: Hug a container, add a child →
the container GROWS to fit it (box width increases, child does not overflow), and
a re-Hug is idempotent (no shrink). Keep the existing 6 green.
