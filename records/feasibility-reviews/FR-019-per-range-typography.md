# FR-019 — Per-range typography generalization

- **Date:** 2026-06-05 · **WI:** WI-093 · **Decision:** DR-062
- **Verdict:** **FEASIBLE WITH TRADE-OFFS**

## Question

Can per-range (sub-selection) styling be extended from outline-only to the full
typography set (color, size, family, decoration, case, letter-spacing), with a
selection-aware display, using the current Lexical-backed editor — without a
vendored agocraft change?

## Assessment

The mechanism already ships and is proven by DR-060 for outline:
`@lexical/selection`'s `$patchStyleText` writes arbitrary inline CSS onto the
selected `TextNode`s (splitting at boundaries); `node.getStyle()` serializes it;
`readSnapshot` reads it into `textRuns`. Generalizing to more CSS declarations is
the same path with more registry rows. The data model needs **no** change:
`PartialTextStyle` already types every in-scope property, and `renderReadOnly`
(DR-057) already renders them per run.

Selection-aware display is a **built-in** Lexical capability:
`$getSelectionStyleValueForProperty(sel, prop, "")` returns the common value or
`""` when the range mixes values — exactly the multi/single signal required.

The one genuine intrinsic limit: per-range font-size as a **ratio** (% of parent
height) has no per-character denominator, so % sizing stays whole-item. px-based
per-range size is unaffected.

## Trade-offs (accepted in DR-062)

1. Per-range font size is px-only (% unit toggle stays whole-item).
2. In-editor outline preview stays single-layer (the layered halo is read-only).
3. `data-dismiss-exempt` is widened to Radix interact-outside for ALL popovers
   (guarded: only marked elements are exempt; covered by a unit test).
4. Selection must be snapshotted to survive the toolbar's focus theft — added
   complexity in the bridge, but it also fixes the apply-on-blur no-op.

## Verdict rationale

No new state of the art is required; all primitives are in-tree and version-
pinned (`@lexical/selection@0.44`). The work is integration + a focus-interaction
fix, not a research risk. → FEASIBLE WITH TRADE-OFFS.
