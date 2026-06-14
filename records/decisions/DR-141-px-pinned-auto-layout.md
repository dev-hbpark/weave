# DR-141 — px-pinned auto-layout subtree (break the ratio↔px circularity)

## Metadata

| Field | Value |
|---|---|
| ID | DR-141 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work item | [WI-225](../work-items/WI-225-px-pinned-auto-layout.md) |
| Related | DR-055/DR-058/DR-059/DR-061 (agocraft Hug sizing), FR-011 (px-native Hug), WI-048 (prior incremental fixes — now subsumed/complemented) |

## Context

weave items have **no stable intrinsic size** — they are sized by a parent-relative
`frame` RATIO. Figma-style auto-layout (Hug / Fill / Fixed) instead requires each
child to have a stable **px** intrinsic. The mismatch made both layout subsystems
**circular**, and the operator hit a cascade of symptoms (gap → container GROWS;
Hug→Fixed→resize → child SHRINKS; move a Hug container → children shrink), then
asked for a *structure* so the problems stop appearing everywhere.

Root cause — one circularity, two surfaces:
- **Hug px pipeline** (`@agocraft/layout`): a child's `sizePx` falls back to
  `frame × container px` (`hug-reflow.ts` buildSizingNode, DR-059) and `gapPx` is
  derived from `gap × container px` (`flexPxOf`). The container (= children + gap)
  thus depends on values that depend on the container → drifts / GROWS each op.
- **Fixed ratio adapter** (`adapters/auto-flex.ts`): reads a child's CURRENT frame
  as its "auto" basis → ratchets on repeated reflow.

## Decision

Make every auto-layout subtree **px-pinned**: at each boundary where the layout
could become inconsistent, pin the px values from the CURRENT geometry —
- each direct child: `layoutChild.sizePx{w,h}` + explicit basis/crossSize (= frame
  ratio, never `"auto"`);
- the container: `gapPx`/`paddingPx` (grid: column/row gap px).

The engine treats these px fields as **authoritative** (they override the ratio
derivation: `flexPxOf` `gapPx ?? …`, `buildSizingNode` `sizePx ?? abs`), so once
pinned the whole subtree is px-native and STABLE — no circularity. Pinning is
**host-level** (weave) — no engine change / re-vendor; it follows the existing
toolbar `gapPx` bake and the WI-048 basis bake.

Helper: `apps/web/src/document/layout/pin-auto-layout-px.ts` —
`pinAutoLayoutPx(doc, container, layout, dW, dH)` returns the pinned layout +
per-child policies/patches; `stagePinned` stages them so a Hug re-fit runs against
the stable px. Pin from the box **before** a Hug re-fit shrinks it (gap px reflects
authored intent), and **preserve** an already-pinned `gapPx` (`?? derive`) so a
fixed gap never shrinks on a re-Hug (Figma: gap is fixed px).

Two wirings:
1. `weave.frame.setSizing` pins (subsuming the WI-048 #2 hug→fixed basis bake) then
   re-fits against the pinned doc.
2. `weave.item.update` only re-lays-out children on a **size** change — a
   position-only MOVE no longer reflows (a child is a ratio of the parent's SIZE,
   so it travels with a move; reflowing ran it through the ratio adapter and shrank
   it).

## Consequences

- The four reported symptoms are gone (verified doc-level e2e `frame-sizing-refit`):
  gap-Hug is constant across repeated Hug (0.53, was 0.557→0.657); Hug→Fixed→resize
  keeps the child's absolute size; the cross-axis height case is stable; a pure move
  leaves children unchanged.
- DR-059 abs-fallback stays as a safety net (rarely hit once pinned).
- **Known follow-up:** adding a child to an ALREADY-Hug container doesn't grow the
  container (and re-Hug then shrinks it) — a separate engine/`item.add` re-fit gap,
  not covered here. The common flow (add children → set Hug) is fully pinned.
