# WI-073 — Snap guide lines: weave host wiring

## Problem

agocraft now owns the snap-guide calculation + the move-drag consumer (DR-036:
`createMoveSnap` + `createFrameMoveBinding`'s optional `snap`). weave needs to
wire it so dragging a frame/item shows alignment guides and snaps — the host's
job is supplying viewport-px rects + rendering the guides (DOM-bound parts).

## Decision

- **`selection-chrome/frame-move-snap.ts`** — `createFrameMoveSnap({ hostEl })`
  returns a `FrameMoveSnap`. On `begin(primaryItemId)` it reads VIEWPORT rects
  from the DOM (`[data-frame-id]` `getBoundingClientRect`):
  - moving = the dragged frame's element,
  - candidates = every other frame-bearing element that is neither an ancestor
    nor a descendant of the moving one (`contains` both-ways filter drops self /
    parents / children),
  - container = nearest ancestor frame, else the design host (`hostEl`) — so a
    top-level frame snaps to the canvas edges/center.
  Hands them to `createMoveSnap`; `snapDelta` delegates; guides are pushed to the
  `snapFeedback` store; `end` clears.
- **`FrameStage.tsx`** — a stable `frameMoveSnap` (useMemo) injected into
  `createFrameMoveBinding({ snap: frameMoveSnap, … })`. `hostEl = () =>
  outerRef.current` (the design plane).
- **`snap-feedback.ts`** — the store gate now shows feedback when EITHER a hit
  (endpoint point-snap, WI-070) OR guide lines (move-snap) are present (was
  hit-only). `SnapFeedbackLayer` already renders `vline`/`hline` guides.

Rects are captured once per gesture (candidate/container geometry is static; the
engine translates the moving rect by the delta). Grid is plumbed but off until a
grid-size setting exists; alignment + bounds + equal-spacing are active.

## Verification

- e2e `frame-move-snap.spec.ts`: dragging frame B so its left edge lands 3px
  short of frame A's left edge snaps B to exact alignment (`b.x ≈ a.x`) and shows
  the guide overlay mid-drag, which clears on release.
- 328 weave unit + typecheck + prod build green. agocraft DR-036 unit coverage
  (snap-targets 10 + createMoveSnap 7 + frame-manip 4).

## Follow-up

- Grid snapping: needs a grid-size setting/UI to pass `grid.step`.
- Multi-select: snaps the primary item; co-moving siblings are currently in the
  candidate set (minor — single-select is the common case).
- Equal-spacing is the v1 center-between-two heuristic (DR-036).

## Links

- agocraft DR-036 (snap guide builders + move consumer), DR-034 (snap engine).
- Reuses `SnapFeedbackLayer` / `snapFeedback` store (WI-070).
