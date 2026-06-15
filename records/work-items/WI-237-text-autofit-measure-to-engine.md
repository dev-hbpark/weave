# WI-237 — Text auto-fit: DOM-measured content size → engine resize

## Metadata

| Field | Value |
|---|---|
| ID | WI-237 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | IN PROGRESS — iteration 1 (design + pure core; DOM/engine wiring live-iterated) |
| Type | Layout architecture (content-driven sizing) |
| Decision | [DR-152](../decisions/DR-152-dom-measured-text-fit-to-engine.md) |

## Goal

Make text size to its content by measuring it in the DOM and feeding the size to
the ENGINE (operator direction), so the box grows to fit instead of clipping /
collapsing / ballooning. Realizes the "separate content-sizing step" the removed
auto-fit's own comment described (`TextBlock.tsx` L11-17), done convergently to
avoid the instability that got the old one removed.

## Design (DR-152)

Measure intrinsic content HEIGHT at the engine-bound width (width unchanged →
convergent) → feed via a **system-origin** coalesced `editor.exec` → engine
relayouts the box. One axis, threshold, idempotent, feature-flagged.

## Plan / iterations

1. **Pure core (this commit)** — `text-autofit.ts`: `shouldRefitHeight(currentPx,
   measuredPx, opts)` (threshold + convergence guard) + `clampRefitPx`. Headless
   unit-tested. No behavior change yet.
2. **DOM measure + engine feed (live loop)** — TextBlock measures content height
   vs box; on overflow beyond threshold and when the flag is on, requests a
   system-origin frame-height update; container hugs so the box grows. Built behind
   a flag (default off), turned on and tuned with the operator in the browser
   (mandatory — the area was removed for instability).
3. **Later** — grid row-track auto-fit (27-row table), font shrink-to-fit fallback
   for genuinely fixed-area cells, width cases.

## Status

- **Iteration 1** (committed) — pure core `text-autofit.ts` + tests.
- **Iteration 2** (committed, flag OFF) — `TextBlock` measures content height
  (`innerRef`) vs the engine box (`wrapRef`) via a `ResizeObserver`; on divergence
  it feeds a corrected `frame.height` RATIO to the engine through the existing
  `onUpdate` seam (`weave.item.update` → layout) — no new prop / context / re-vendor
  needed (TextBlock computes the ratio from its own box+content+current ratio, so the
  host needs no parent-px). Guards: flag `localStorage["weave.textAutofit"]==="on"`
  (default off), skip auto-grid children (track owns height), skip while editing /
  locked / present-mode (no onUpdate), threshold + `MAX_REFIT_ATTEMPTS` hard cap.
  Full suite green (1427), flag-off = zero behavior change.
- **Live loop NEXT (operator)**: set the flag on, regenerate, verify the box grows
  to fit (no clip/overlap, converges in ≤1 write, no undo/thrash storm). Known
  iteration-2 limitations to tune live: the refit goes through the undoable
  user-command path (iteration 3 = system origin / coalesce); only flex/absolute
  text (grid row-track + font shrink-to-fit are later). Disable instantly by clearing
  the flag if any oscillation appears.
