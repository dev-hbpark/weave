# DR-143 — Forward wheel from portaled selection handles into the camera, scoped by handle marker

## Metadata

| Field | Value |
|---|---|
| ID | DR-143 |
| Date | 2026-06-15 |
| Status | ACCEPTED |
| Work item | [WI-228](../work-items/WI-228-handle-wheel-zoom-passthrough.md) |
| Related | [DR-129](DR-129-selection-chrome-visible-vs-interactive.md) (visible-vs-interactive chrome) |

## Context

The camera wheel handler (pinch-zoom + two-finger pan) is a native non-passive
listener bound to the canvas outer element so `preventDefault()` can suppress the
browser's page-zoom. Selection-chrome handles portal to `document.body`, so they
are siblings of the canvas, not descendants. Interactive handles
(`pointer-events: auto`) become the wheel target when hovered, and the event never
bubbles to the canvas listener — the camera freezes and the page zooms instead.
`pointer-events: none` chrome (hover affordances, outline, snap layers) already
passes wheel through to the canvas, so the gap is narrowly the interactive handles.

## Options considered

1. **Bind the wheel listener at `window`/`document` and gate by hit-testing the
   pointer against the canvas rect.** Rejected — too coarse: floating UI that
   overlaps the canvas rect (toolbars, Aku launcher, scrollable panels) would have
   their scroll hijacked into canvas zoom.
2. **Add `onWheel` to every handle component to re-dispatch.** Rejected — spreads
   identical logic across ~6 handle files (resize/rotate, corner-radius, chart,
   layout, poly-vertex, slide-bullet) and is easy to miss for future handles.
3. **Chosen: one document-level capture listener that forwards to the existing
   camera handler only when the wheel target is a handle marker.**

## Decision

In the same `useEffect` that binds the canvas wheel listener, add a capture-phase
`document` wheel listener. It runs the **same** `handler` closure (identical zoom +
pan math, identical `preventDefault`) but only when
`e.target.closest("[data-handle-kind],[data-selection-handle-id]")` is non-null —
the universal markers for interactive selection chrome (the handle node carries
`data-handle-kind`; the registry wrapper div carries `data-selection-handle-id`).

The marker gate is what keeps it correct:

- Handles are always portaled outside the canvas subtree, so the canvas listener
  never sees them — no double-fire from the canvas side.
- Ordinary canvas content never matches the markers, so the document forwarder is a
  no-op for normal wheels — the canvas listener stays authoritative there.
- The zoom anchor uses the canvas `getBoundingClientRect()`; handles sit visually
  over the canvas, so the pointer is within that rect and the anchor math is
  unchanged.

## Consequences

- Hovering any current or future selection handle no longer freezes pinch-zoom /
  pan; the page-zoom leak is gone (the forwarded handler calls `preventDefault`).
- New interactive handles get the behavior for free as long as they carry one of
  the two existing markers — which the resize/rotate hit-test dispatcher
  (`FrameStage.tsx`, WI-067 P3) already relies on, so the convention is established.
- Cost is one `closest()` call per wheel tick while a handle is the target;
  negligible and only on the chrome path.
- No agocraft change: `SelectionLayer` / `SelectionHandle` and the camera live in
  weave's own `apps/web` + `packages/design-system`, so no re-vendor is needed.
