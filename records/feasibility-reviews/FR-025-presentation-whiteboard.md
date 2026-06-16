# FR-025 — Presentation-view whiteboard (ephemeral ink + blank board, real-time multi-user)

## Metadata

| Field | Value |
|---|---|
| ID | FR-025 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |
| Work Item | [WI-239](../work-items/WI-239-presentation-whiteboard-ink.md) |
| Decision | [DR-154](../decisions/DR-154-presentation-whiteboard-phased-ephemeral-ink.md) |

## The idea being judged

Add a "whiteboard" to the presentation view that can (a) draw freehand ink **over a
live slide** (PowerPoint pen) and (b) toggle a **blank ephemeral board** for ad-hoc
sketching — with ink **not persisted** to the document (lives for the presentation
session only) but **shared in real time across multiple viewers**.

## What current tech (this codebase) can and cannot deliver

### Capable today (FEASIBLE)
- **Ink overlay rendering** — `Stage` (`packages/design-system/src/components/Stage.tsx`)
  is a present-only custom renderer; an ink layer composited above its scenes is a
  clean structural addition. No engine/layout coupling (Stage is read-only).
- **Freehand capture** — standard `pointerdown/move/up` → stroke points. A new input
  modality for present mode, but a well-trodden one.
- **Ephemeral ink** — matches the existing reveal/step model: local React state,
  resets on refresh/close. No document mutation, so present mode stays strictly
  read-only (no `editor.exec`, no new persisted item kind). ✅ aligns with the
  chosen "휘발성" storage scope.
- **Design-space coordinate mapping** — `clientToLocal` / `project` already exist
  (used by `PresenceCursors`) so ink can stick to slide content through camera
  zoom/pan and survive different remote viewports.

### Capable but gated (TRADE-OFF)
- **Real-time multi-user** — the *correct transport already exists*: `@agocraft/sync`
  SyncEngine exposes a **Yjs Awareness presence channel** (`engine.presence.setLocal`)
  plus a room API (`apps/web/api/sync/[roomId]/{push,since,snapshot}.ts`) and remote
  rendering (`PresenceCursors`). Ephemeral ink is the *same shape* as remote cursors
  (awareness state is session-scoped and never written to the Yjs doc — intrinsically
  "휘발성").
  **BUT:** it is turned **OFF** — `SYNC_ENABLED = false` in `DesignPage.tsx` (WI-028
  paused because Upstash usage outran collaboration value) — and **not wired into
  present mode at all**. Present mode also has **no session/room concept**: each
  viewer loads the document independently by URL.
  → Multi-user is therefore an **operations/cost decision gate**, not a pure
  engineering task. Un-pausing WI-028 adds present-session awareness traffic to the
  same metered backend that was deliberately paused.

### Intrinsic limits / unavoidable trade-offs
- Ink shared as awareness is **best-effort, lossy, and ephemeral by design** — there
  is no late-joiner replay or persistence without crossing into WI-028 document CRDT
  territory (out of scope by the "휘발성" choice). A viewer joining mid-session sees
  ink only from that point forward. Acceptable for live presentation; not a
  persisted artifact.
- A blank ephemeral board cannot live in the document step sequence without
  persistence; it must be a present-only overlay state (navigation-model change if
  ever inserted *between* steps).

## Scope-reduction that removes the trade-off

The only hard dependency (paused, cost-sensitive WI-028 infra) sits entirely on the
multi-user axis. **Splitting local ink from multi-user** lets the local-presenter
capability ship with **zero infra dependency**, decoupled from `SYNC_ENABLED`:

- **Phase 1 — local presenter ink + blank board** → FEASIBLE, no gate.
- **Phase 2 — real-time multi-user** → FEASIBLE once the WI-028 cost decision is
  made; rides Phase 1's stroke stream onto the awareness channel (same transport as
  cursors, throttled point-batch broadcast ≈ cursor-level load).

## Verdict

**FEASIBLE WITH TRADE-OFFS.** Local ink and the blank board are unconditionally
buildable now. Real-time multi-user is technically ready (transport exists) but
blocked on an explicit infra-cost decision (WI-028 re-activation), so it is carved
into Phase 2 behind that gate. Recommended boundary: ship Phase 1 standalone; treat
Phase 2 as a separate launch gated on the cost decision.
