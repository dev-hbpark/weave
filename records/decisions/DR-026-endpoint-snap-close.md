# DR-026 — Endpoint snap-to-close UX (Alt free-move → snap → fuse → shape)

## Status

Accepted (2026-06-01). Implements WI-070. Builds on agocraft DR-034 (snap engine)
and DR-031 (shape↔line conversion).

## Context

Closing a line into a shape existed only as an explicit right-click menu action
(WI-065). Users want it to fall out of direct manipulation: drag one endpoint
near the other and release. This must reuse a general snap mechanism (the host's
roadmap includes alignment guides, equal spacing, edge midpoints, grid), not a
bespoke endpoint hack.

## Decision

1. **Gate** — snapping is offered ONLY when the dragged handle is an `endpoint`
   being **free-moved** (Alt; the existing modifier strategy), the line has **≥ 4
   points**, and the host supplied `onCloseBySnap`. ≥ 4 because fusing the two
   ends drops one vertex; a 3-point line would collapse to a 2-vertex sliver. The
   closed-shape VM never supplies `onCloseBySnap`, so closed shapes (no endpoints)
   and open polys without a close action show no snap.
2. **Fuse semantics** — on snapped release, drop the trailing endpoint and close
   the remaining points (`weave.line.closeToShape { fuseEndpoints: true }`), so
   the two coincident ends become ONE shared corner (user choice: "하나로 합치기").
   The non-fuse close (keep both ends) remains the menu default.
3. **Threshold** — 6px radial (shared snap default). One constant
   `ENDPOINT_SNAP_PX` in the consumer, mirrored as the engine's `pointRadiusPx`.
4. **Feedback** — the opposite endpoint's handle gets a distinct will-fuse halo
   (`data-snap-target`), and a body-portal'd `SnapFeedbackLayer` renders the snap
   guide. Both read a tiny subscribable `snapFeedback` store (the `vertex-selection`
   pattern) so the portal'd chrome re-renders without a parent re-render.
5. **Reuse structure** — the consumer routes through the shared
   `SNAP_PROVIDERS` registry + `resolveSnap`, not a direct distance check, so
   future providers automatically contribute targets to endpoint drags too, and
   future situations reuse the same engine + feedback layer (Phase 2).

## Undo

Two transactions: the merged drag (one undo) then the conversion (remove+create).
Cmd+Z → snapped-but-open line at the original id; Cmd+Shift+Z → re-closed shape.
Consistent with the menu-close undo contract (DR-031).

## Alternatives rejected

- **Keep both endpoints on snap** (existing close): leaves a redundant coincident
  vertex; a 3-point line yields a degenerate sliver. Rejected per user choice.
- **Single atomic transaction** (drag + close as one undo): would require the
  close command to absorb the drag patch; not worth the coupling — two undos
  matches the established conversion UX.
- **Bespoke endpoint distance check** (no shared engine): rejected — the host
  explicitly wants one mechanism across all snap situations (agocraft DR-034).

## Verification

e2e `line-endpoint-snap-close.spec.ts` (snap+fuse+close, undo/redo, outside-
threshold no-op, 3-point no-snap). See WI-070 for the full gate result.

## Links

- WI-070; agocraft DR-034 (engine), DR-031 (conversion); DR-024 (frame refit),
  DR-025 (line kind), DR-032 (handle pipeline).
