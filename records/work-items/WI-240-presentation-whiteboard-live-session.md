# WI-240 — Whiteboard Phase 2: real-time multi-user ink (presenter-broadcast live session)

## Metadata

| Field | Value |
|---|---|
| ID | WI-240 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Status | **BUILT — client + relay implemented & verified (unit + real-WS integration); pending small-think server **redeploy** + the manual two-browser tunnel gate.** |
| Type | New feature — real-time present-mode collaboration |
| Builds on | [WI-239](WI-239-presentation-whiteboard-ink.md) (Phase 1 ink, DONE) |
| Feasibility | [FR-026](../feasibility-reviews/FR-026-presentation-whiteboard-phase2-realtime.md) (FEASIBLE ≈ $0) |
| Decision | [DR-155](../decisions/DR-155-present-live-session-relay.md) |
| Risk | [RISK-013](../risks/RISK-013-presentation-whiteboard.md) (R1 downgraded, R5/R6/R7) |
| Depends on | small-think **HANDOFF-032** (generic room-relay WS path on the existing agent-server / tunnel) |

## Problem

Phase 1 (WI-239) gives a presenter local ink + a blank board. Phase 2 broadcasts that
ink, in real time, to viewers in the same presentation so an audience watching remotely
sees the presenter draw live.

## Decisions carried in (FR-026 / DR-155)

- **Transport is a NEW thin WS relay, not the paused WI-028 stack.** The existing
  HTTP-poll sync carries the *document*, not awareness — its `Awareness` never goes
  over the wire — so flipping `SYNC_ENABLED` would move zero strokes. Present ink needs
  neither Upstash, polling, nor document CRDT.
- **Infra = reuse small-think's always-on box + Cloudflare tunnel** (operator decision).
  Marginal cost ≈ $0. A generic room-relay path (`/relay`) on the existing agent-server
  (port 8788, same tunnel) — requested via HANDOFF-032. small-think owns a domain-neutral
  fan-out; weave owns all ink/session semantics.
- **MVP = presenter-broadcast-only, presenter-driven session.** Only the presenter
  draws and navigates; viewers receive ink + follow the presenter's slide. Eliminates
  multi-writer conflict, authority, and abuse for v1. Two-way whiteboarding is a later
  increment on the same relay.

## Scope

**In scope (MVP)**
- A **live session**: presenter clicks "Go live" → a room id is minted → a shareable
  viewer link (`/design/:id/present?session=<room>`).
- **Presenter (host)** publishes over the relay: each committed stroke / erase / clear
  (via the Phase-1 `onCommitStroke`/`onErase` seam) **and** step changes.
- **Viewer (subscriber)** renders the presenter's strokes on a remote ink layer and
  **follows the presenter's current slide**; local drawing disabled.
- Connection status chip (connecting / live / reconnecting) + reconnect with backoff.
- Relay URL from `VITE_WEAVE_RELAY_URL`, defaulting to the `VITE_AKU_AGENT_URL` origin
  + `/relay` (same tunnel).

**Out of scope (later increments)**
- Two-way collaborative whiteboarding (every viewer draws) — needs authority + per-actor
  attribution (`colorForActor` already exists).
- Late-joiner replay / persistence (awareness is best-effort by design — RISK-013 R5).
- Viewer-independent navigation during a session (MVP is presenter-driven).
- Auth / private rooms (rides the existing global-anonymous model; room id is the only
  capability — treat as unlisted, not secret).

## Architecture

```
Presenter present page                          Viewer present page
  InkLayer (Phase 1)                               InkLayer (Phase 1, remote surface)
    └ onCommitStroke ─┐                              ▲ session.addStroke(remote)
                      ▼                              │
   PublishingSession (Decorator over InkSession)    LiveSession (subscriber)
     · writes through to local session              · relay.onMessage → dispatch → session
     · relay.send({t:"stroke",…})                   · {t:"step"} → follow presenter
                      │                              ▲
                      ▼          wss (same tunnel)   │
                 RelayTransport ───────────────────► RelayTransport
                      │                              │
                      └─────────► small-think /relay?room=<id> ◄────┘   (generic fan-out)
```

## Engineering Plan

**P0 — small-think relay (HANDOFF-032, blocking)**
- Generic room-relay WS path `/relay?room=<id>`: a client joins a room; any message it
  sends is broadcast to every *other* member of that room. Ephemeral, no persistence,
  bounded (max rooms / members / msg size / rate). Domain-neutral (no ink knowledge).
- Requires switching the agent-server's `ws` server to path-routed upgrades
  (`noServer:true` + `upgrade` handler) so `/relay` and the existing Aku link share
  port 8788 / the one tunnel. Server redeploy.

**P1 — relay client + wire protocol** (`features/present/ink/relay/`)
- `relay-transport.ts` — thin WS client: `connect(url, room) / send(msg) / onMessage /
  status / close`, reconnect with capped backoff. Domain-neutral JSON envelope.
- `session-message.ts` — wire union `{t:"stroke"|"erase"|"clear"|"step", …}` +
  a **handler registry** for inbound dispatch (no `switch (t)` — Rule 6).

**P2 — publishing seam (Decorator)** (`relay/publishing-session.ts`)
- `createPublishingSession(base: InkSession, publish): InkSession` — writes through to
  the local session AND publishes stroke/erase/clear. Phase-1 `InkLayer` is unchanged
  (it just receives a different `InkSession`). This is the Phase-1 producer/consumer
  seam realized as composition — no capture/render edits.

**P3 — live-session controller** (`use-live-session.ts`)
- Owns room id, role (host/viewer — a strategy, not inline branches), status.
- Host: wires step changes + the publishing session.
- Viewer: relay inbound → `session.addStroke/eraseAt/clear` + a `followStep` callback;
  drawing disabled (ink mode forced off).

**P4 — PresentPage wire + chrome**
- "Go live" affordance (host) → mint room, push `?session=<room>`, show share link +
  status chip. Viewer (`?session` present, not host) → subscriber + presenter-driven
  step. Reuse `PresentChrome`/design-system primitives (Design System Triage).

**P5 — Self-verification (Continuous)**
- Two-context live check: presenter draws → viewer sees the stroke anchored on the same
  slide; presenter advances → viewer follows; clear propagates; reconnect after a drop.

## SOLID / GRASP pass

- **SRP:** transport (connection) · wire protocol (registry dispatch) · publishing
  (Decorator) · session controller (orchestration) are separate units.
- **OCP / Rule 6:** inbound messages dispatch through a handler registry keyed by `t`;
  host/viewer is a role strategy — no `switch`/inline mode compares.
- **OCP (the Phase-1 seam pays off):** publishing is a Decorator over `InkSession`;
  Phase-1 capture/render/InkLayer are untouched — Phase 2 is purely additive.
- **Rule 2:** app/runtime code → component+hook + stateful controller; no inheritance.
- **Dependency direction:** the relay is domain-neutral (rooms + opaque messages);
  ink/session semantics live entirely in weave. small-think gains no ink knowledge.

## QA / test plan

- Unit: `relay-transport` reconnect/backoff (mock WS); `session-message` handler
  registry round-trip; `publishing-session` Decorator (write-through **and** publish);
  `use-live-session` host vs viewer behavior.
- E2e: a **local stand-in relay** (a few-line `ws` server in the test harness) + two
  browser contexts — presenter draws → viewer renders the stroke; step follow; clear
  propagation; mid-session reconnect. Uses the `createDeckNoIdle` setup from WI-239 to
  dodge the shared-helper networkidle flake.
- **Live gate (manual):** one real run over the small-think tunnel after HANDOFF-032
  lands + server redeploy.

## Risks / gates

- **Ops (RISK-013 R1, downgraded to MEDIUM-ops):** the tunnel must give a stable `wss://`
  for the session's duration. Quick-tunnel URLs are stable within a run but rotate on
  `cloudflared` restart → weave `VITE_WEAVE_RELAY_URL` update + redeploy (same oper; see
  small-think-cloudflare-tunnel-ops). A named tunnel + domain removes this for production.
- **R7 (new):** present mode now opens an outbound WS on a read-only page — keep it
  **opt-in** (only on "Go live" / `?session`), never auto-connect, so the default present
  path is unchanged and carries no new connection/attack surface.
- **Late join / abuse / authority:** RISK-013 R5/R6 — bounded by the one-way MVP.

## Build result (2026-06-16)

**P0 — small-think relay (HANDOFF-032 implemented same session): DONE.** Generic
`/relay?room=` path + `createRoomRelay` fan-out on the agent-server (port 8788, same
tunnel); path-routed WS upgrades (Aku default path intact). small-think WI-061 / DR-074.
Verified: 7 relay unit tests + **real-WebSocket integration 6/6** (fan-out excludes
sender, room isolation, caps, invalid-room close, **Aku default path still yields a
DuplexLink**). Link suite 23 green, depcruise (`ws` confined) + declarativecheck clean.
**Pending: server redeploy (dist) to go live.**

**P1–P4 — weave client (`features/present/ink/relay/`): DONE.**
- `session-message.ts` — wire union `stroke|sync|step` + handler-registry dispatch (no
  `switch` — Rule 6); hot path = incremental `stroke`, erase/clear/undo/redo = full
  `sync`, `step` follows presenter.
- `relay-transport.ts` — thin WS client, capped-backoff reconnect, injectable socket +
  scheduler seams (no React).
- `publishing-session.ts` — **Decorator over `InkSession`** (`createPublishingSession`):
  write-through to local + publish. **Phase-1 InkLayer/capture untouched** — the
  producer/consumer seam paying off (DR-155).
- `use-remote-ink-session.ts` — viewer read-only session driven by inbound messages.
- `use-live-session.ts` — role controller (off/host/viewer), opt-in connect, host step
  broadcast, viewer follow; `relay-url.ts` derives the URL from `VITE_AKU_AGENT_URL` +
  `/relay` (or `VITE_WEAVE_RELAY_URL`).
- `PresentPage.tsx` + `InkToolbar.tsx` — `live.session` feeds the InkLayers; viewers get
  a "following" chip (drawing disabled); host gets Go-live / ● Live / copy-link / Stop.
  Opt-in only — no socket on the plain present path (R7).

**Verification:** weave typecheck + lint clean; **12 relay unit tests** (protocol
round-trip, transport reconnect/backoff/dispose with a fake socket, decorator
write-through+publish, **full logical wire round-trip presenter→viewer**); full weave
suite **1457** green; **Phase-1 e2e 3/3 green (no regression** — relay-unconfigured =
live off = Phase 1 unchanged).

## Remaining / sequencing

1. **small-think server redeploy** (rebuild dist + restart launchd) so `/relay` is live.
2. **Manual two-browser live gate** over the tunnel (presenter draws → viewer sees +
   follows; reconnect) — the one layer not glued in-browser here (relay env + tunnel
   needed; every layer below it is unit/integration-verified).
3. Decommission sweep: none (net-new). Out of scope (later WI on the same relay):
   two-way whiteboarding, board-surface broadcast (board is presenter-local in v1),
   late-joiner replay.
