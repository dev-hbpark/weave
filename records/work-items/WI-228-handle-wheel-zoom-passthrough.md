# WI-228 — Pinch-zoom / trackpad pan freezes when the pointer is over a selection handle

## Metadata

| Field | Value |
|---|---|
| ID | WI-228 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (fix + regression e2e + live-verified) |
| Type | Bug fix (canvas camera interaction) |
| Decision | [DR-143](../decisions/DR-143-handle-wheel-forwarding.md) |
| Related | [DR-129](../decisions/DR-129-selection-chrome-visible-vs-interactive.md) — same class (portaled selection chrome intercepting a pointer/wheel gesture) |

## Problem

With the pointer hovering a hover/selection handle, pinch-to-zoom (ctrl/⌘+wheel)
and two-finger trackpad pan (plain wheel) stopped working — the canvas froze and
the browser's default page-zoom leaked through (header/footer sliding out).

Root cause: the camera `wheel` listener is a native non-passive listener bound to
the canvas outer element (`outerRef`) in `FrameStage.tsx`. But selection-chrome
handles render via `createPortal(..., document.body)` (`SelectionLayer.tsx`,
`SelectionHandle.tsx`) — they are **DOM siblings of the canvas, not descendants**.
Interactive handles are `pointer-events: auto`, so when the pointer is over one,
the wheel event's target is the handle; it bubbles up `body → html → document` and
**never reaches the `outerRef` listener**. The camera zoom/pan handler never runs,
and nothing calls `preventDefault()`, so the browser page-zooms instead.

Only the interactive handles are culprits: hover affordances, the selection
outline, and the snap/rotation feedback layers are all `pointer-events: none`
(`HoverAffordanceLayer.tsx`, `SelectionLayer.tsx`), so wheel passes through them to
the canvas already.

## Fix

`apps/web/src/pages/FrameStage.tsx` — in the wheel `useEffect`, add a
**document-level capture** wheel listener that forwards into the **same** camera
`handler` when the event target is a selection-chrome handle
(`closest("[data-handle-kind],[data-selection-handle-id]")`). Ordinary canvas
wheels fail the marker test and are left to the existing `outerRef` listener, so
there is no double-fire. Both listeners are torn down together.

## Verification

- `apps/web`: `tsc --noEmit` clean.
- Regression e2e added to `apps/web/e2e/canvas-pan-backswipe.spec.ts`: select a
  frame, park the pointer over its `Resize se` handle, dispatch a plain wheel,
  assert the camera pans (`tx≈120, ty≈90`).
- Live browser run: **3/3 green** with the fix. With the forwarder disabled, the
  new test **fails** (pan stays `{0,0}`) while the existing two pass — confirming
  the test guards exactly this regression.
