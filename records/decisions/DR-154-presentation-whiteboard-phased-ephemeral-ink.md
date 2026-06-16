# DR-154 — Present-mode whiteboard: ephemeral ink as a present-only overlay, multi-user split into a gated Phase 2

## Metadata

| Field | Value |
|---|---|
| ID | DR-154 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Status | Accepted (Phase 1 planning) |
| Work Item | [WI-239](../work-items/WI-239-presentation-whiteboard-ink.md) |
| Feasibility | [FR-025](../feasibility-reviews/FR-025-presentation-whiteboard.md) |
| Risk | [RISK-013](../risks/RISK-013-presentation-whiteboard.md) |
| Scope | weave `apps/web/src/features/present/ink/*`, `Stage`/`PresentChrome` overlays — Phase 1 only |
| Related | WI-028 / `SYNC_ENABLED` (paused multi-user infra — Phase 2 dependency) |

## Context

Operator wants a whiteboard in the presentation view: slide annotation + a blank
board, **ephemeral** ink, **shared in real time**. Present mode is strictly
read-only today, has no ink capability, no pointer-drag input, and the multi-user
transport that fits this (Yjs Awareness, `PresenceCursors`) is built but **OFF**
(`SYNC_ENABLED = false`, WI-028 paused on Upstash cost). The chosen storage scope
(휘발성) and the chosen collaboration scope (real-time multi-user) pull in opposite
difficulty directions: the former is the easiest persistence option, the latter the
hardest collaboration option — and the hard part is an infra-cost decision, not code.

## Decision

1. **Ink is a present-only ephemeral overlay, never a document mutation.** Strokes
   live in present-session React state (like reveal/step state), keyed by step.
   Present mode stays strictly read-only — no `editor.exec`, no new persisted item
   kind. This honors the 휘발성 choice and keeps the read-only present contract
   (WI-194/DR-127) intact.

2. **Split local ink from real-time multi-user along the only hard dependency.**
   - **Phase 1 (WI-239):** local presenter ink + blank board. Zero infra dependency,
     independent of `SYNC_ENABLED`. Ships standalone.
   - **Phase 2 (separate WI):** real-time multi-user, **gated on an explicit WI-028
     cost/re-activation decision**. It rides Phase 1's stroke stream onto the
     awareness channel (same transport as remote cursors).

3. **Design the Phase-1 capture as a producer/consumer seam so Phase 2 is additive.**
   Capture emits committed strokes synchronously via an `onStroke` callback with an
   origin tag; the consumer chooses scheduling. Phase 1 consumer = local renderer;
   Phase 2 adds an awareness-broadcast consumer **without editing capture**. Producer
   never embeds consumer policy — the workspace producer/consumer principle.

4. **Ink is design-space, not screen-space.** Strokes store design-space points and
   project through the same camera transform as `Stage`/`PresenceCursors`
   (`clientToLocal` reused). Required so ink anchors to slide content under zoom/pan
   and (Phase 2) maps correctly across different remote viewports.

5. **Blank board is a toggled present-only overlay, not a document step.** It does
   not enter the step sequence (no navigation-model change in Phase 1).

## Why not the alternatives

- **Persist ink to the document (new item kind + `editor.exec` in present)** —
  rejected: contradicts the 휘발성 choice, breaks the read-only present contract,
  and pulls in undo/history/serialization scope for an artifact the operator
  explicitly wants ephemeral.
- **Build multi-user now in one phase** — rejected: hard-blocks the whole feature on
  a paused, cost-sensitive infra decision (WI-028). The phase split lets local value
  ship while the cost call is made independently.
- **Screen-space ink (simpler capture)** — rejected: ink would detach from content
  under zoom/pan and could not map across remote viewports in Phase 2; the
  design-space seam already exists from presence cursors.
- **A standalone gesture/drawing engine** — rejected: present `Stage` is read-only
  and decoupled from the layout engine; a composited overlay avoids engine coupling
  and the known present live-input feedback-loop trap.

## Consequences

- Phase 1 delivers presenter annotation + blank board with no infra cost and no
  document risk; fully reversible (ephemeral).
- Phase 2 carries the only real risk surface (metered awareness traffic) and is
  isolated behind a decision gate — see RISK-013.
- Late-joiner replay / persisted ink are explicitly NOT delivered (out of scope by
  the 휘발성 decision); revisit only if requirements change.
- Sets the present-mode pattern: ephemeral live-session layers ride awareness, not
  the document CRDT.
