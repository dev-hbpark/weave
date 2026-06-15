# DR-152 — DOM-measured text content size → engine resize (auto-fit, the architecture's "separate step")

## Metadata

| Field | Value |
|---|---|
| ID | DR-152 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DESIGN (iteration 1 — requires live verification) |
| Work Item | [WI-237](../work-items/WI-237-text-autofit-measure-to-engine.md) |
| Scope | weave `TextBlock` (measure) + a system-origin mutation (feed) + the layout engine (resize) |
| Supersedes the partial | WI-235/236 (add-path height guess/estimate) become fallbacks once real measurement drives size |

## Context / decision (operator direction)

The persistent clip/overlap/whitespace is one root: **weave has no text measurement,
so text never sizes to its content.** Add-path heuristics (WI-235 share, WI-236
estimate) only approximate and break on over-stuffed cells (proven live: a big
number + label in a small KPI cell → estimates hit the 0.95 cap, sum > 1 → flex
shrinks → collapse).

Operator direction (chosen approach): **detect overflow in the DOM, pass the
measured size to the ENGINE, and let the ENGINE change the size.** This is exactly
the replacement the removed auto-fit's own comment described (`TextBlock.tsx` L11-17:
"content-driven sizing is a SEPARATE STEP, fed into the engine as an input rather
than measured at render time"). The OLD removed ResizeObserver "fought the engine"
because it wrote BOTH axes' frame size back inside the render loop, non-convergently.

## Decision — convergent measure → engine-input → resize

1. **Measure (DOM, TextBlock)**: observe each text's **intrinsic content size at its
   engine-bound width** — i.e. the natural height the wrapped text needs in the
   width the layout already gave it. Width is the CROSS axis (column-bound, engine-
   owned) → the measurement does NOT depend on the box height → re-measuring after a
   height change yields the SAME value → **convergent, no loop** (the old approach's
   failure was measuring/​writing width too).
2. **Feed to engine (system-origin mutation)**: when the measured content height
   differs meaningfully (> threshold) from the item's current box height, write it
   via `editor.exec` with **origin `system`** (NOT a user-undoable step, like a
   handle-resize commit) — routed through the normal command path (weave mutation
   rule / History contract). Coalesced/debounced so a burst of measurements is one
   write.
3. **Engine resizes**: the command sets the text's main-axis size (frame.height /
   layoutChild intrinsic), the engine relayouts, the box grows to fit → no clip.
   Containers set to hug then grow with it.

## Loop / instability guards (why this won't repeat the removed bug)

- **One axis only** (height; width stays engine-bound) → the measurement's input
  (width) is not changed by the output (height) → fixed point.
- **Threshold + coalesce** → no thrash on sub-pixel deltas.
- **System origin** → not in undo history; does not interfere with user edits.
- **Idempotent** → after the box equals the measured content, the next measure
  equals the box → no further write.
- Feature-flagged for the first live iterations so it can be disabled instantly if
  any oscillation appears (the area was removed for instability — live verification
  is mandatory before it's on by default).

## Scope / iterations

- **Iteration 1 (this WI)**: height auto-fit for text in flex layouts (the clip/
  collapse case). Container hug so the box grows. Behind a flag; live-verified.
- **Later**: grid row-track auto-fit (the 27-row table), shrink-to-fit FONT as a
  secondary fallback when even hugging can't fit (fixed-area cells), width cases.

## Consequences

- Touches three layers (measure / mutation / engine). Higher risk than the add-path
  patches → **mandatory live verification**, feature-flagged, revertible.
- Once real measurement drives size, WI-235/236 add-path guesses become a
  pre-paint fallback (first frame before the observer runs), not the primary sizer.
- A pure decision helper (`shouldRefitHeight(currentPx, measuredPx, threshold)`) is
  unit-tested headless; the DOM measurement + engine relayout are live-verified.

## Related

- `TextBlock.tsx` L11-17 — the removed auto-fit + the intended separate step (this DR realizes it).
- WI-235/236 (add-path height) — now fallbacks.
- WI-237 — implementation + live iteration log.
