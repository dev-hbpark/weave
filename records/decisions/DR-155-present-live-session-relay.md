# DR-155 — Present-mode live ink rides a generic WS relay on the reused small-think tunnel; MVP is presenter-broadcast-only

## Metadata

| Field | Value |
|---|---|
| ID | DR-155 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Status | Accepted (Phase 2 planning) |
| Work Item | [WI-240](../work-items/WI-240-presentation-whiteboard-live-session.md) |
| Feasibility | [FR-026](../feasibility-reviews/FR-026-presentation-whiteboard-phase2-realtime.md) |
| Supersedes (partial) | DR-154 §3 sketch ("rides the awareness channel") — see below |
| Depends on | small-think HANDOFF-032 |

## Context

Phase 2 needs to broadcast ephemeral ink to viewers in real time. FR-026 established:
(a) the existing HTTP-poll transport carries the document, not awareness, so it cannot
move ink at all; (b) the WI-028 Upstash cost gate does not apply (present is read-only,
ink is ephemeral); (c) the only $0 fit for a persistent push channel is a WS server on
an always-on box; (d) the operator chose to **reuse small-think's always-on Mac +
Cloudflare tunnel**.

## Decision

1. **A new, domain-neutral WS room-relay is the transport — not the paused WI-028 stack
   and not Yjs awareness.** A client joins a room and any message it sends is fanned out
   to the other members; ephemeral, no persistence. This decouples Phase 2 entirely from
   the paused collaborative-sync subsystem. (This refines DR-154 §3, which assumed Yjs
   awareness — moot, since that channel never worked over the network and present needs
   no document.)

2. **Host the relay on the existing small-think agent-server / tunnel.** Add a path-routed
   `/relay` endpoint sharing port 8788 and the one Cloudflare tunnel (HANDOFF-032). The
   relay is generic infra owned by small-think (no ink knowledge); **all ink/session
   semantics stay in weave**. Marginal infra cost ≈ $0.

3. **Realize publishing as a Decorator over `InkSession`.** `createPublishingSession`
   writes through to the local Phase-1 session AND publishes — so Phase-1 capture/render
   /`InkLayer` are untouched. This is the Phase-1 producer/consumer seam paying off
   exactly as designed.

4. **MVP = presenter-broadcast-only, presenter-driven.** Only the presenter draws and
   navigates; viewers render the presenter's strokes and follow the presenter's slide.
   No multi-writer authority, conflict, or abuse surface in v1.

5. **Opt-in connection.** Present mode opens a WS only on "Go live" / a `?session` URL —
   never by default. The plain present path keeps zero new connection surface (R7).

## Why not the alternatives

- **Flip `SYNC_ENABLED` / reuse HTTP-poll** — rejected: carries the document not
  awareness (moves zero strokes), and reintroduces the polling cost that paused WI-028.
- **`y-websocket` server (carry Y.Doc + Awareness)** — rejected for the MVP: drags in
  the whole document-CRDT machinery present mode doesn't need; a thin relay over the
  Phase-1 `InkStroke` model is simpler and fully decoupled. (Revisit only if real
  document collaboration is ever wanted in present.)
- **Vercel SSE + Upstash pub/sub** — rejected: bills GB-s per connected-viewer-minute +
  Upstash commands (the WI-028 cost shape × audience size). The reused always-on box is
  $0.
- **A dedicated second tunnel/port for weave** — rejected per operator choice to reuse
  the existing tunnel; path-routing on 8788 keeps one endpoint to operate.
- **Two-way whiteboarding in v1** — deferred: authority/attribution/abuse cost without
  buying the core "audience watches the presenter" value.

## Consequences

- Phase 2 is additive over Phase 1 (Decorator + new modules); no rework of WI-239.
- A cross-project dependency on small-think (HANDOFF-032) + a server redeploy gate.
- The only standing risk is operational (stable `wss://` — quick-tunnel URL rotation;
  RISK-013 R1) plus the new opt-in WS surface (R7). Cost is closed (≈ $0).
- Sets the pattern: present-mode live-session layers ride a generic relay, owned as
  neutral infra, with all domain semantics on the weave client.
