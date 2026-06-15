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

- Iteration 1 pure core + tests landed; WI-235/236 remain the pre-paint fallback.
- DOM/engine wiring pending the live-iteration loop with the operator.
