# FR-026 — Whiteboard Phase 2 (real-time multi-user): cost & infrastructure feasibility

## Metadata

| Field | Value |
|---|---|
| ID | FR-026 |
| Date | 2026-06-16 |
| Owner | hbpark |
| Verdict | **FEASIBLE — at ≈ $0 marginal infra cost, but NOT via the paused WI-028 path. The real gate is ops + a net-new session model, not money.** |
| Scope | Real-time multi-user ink for present mode (Phase 2 of [WI-239](../work-items/WI-239-presentation-whiteboard-ink.md)) |
| Builds on | [FR-025](FR-025-presentation-whiteboard.md), [DR-154](../decisions/DR-154-presentation-whiteboard-phased-ephemeral-ink.md), [RISK-013](../risks/RISK-013-presentation-whiteboard.md) |
| References | WI-028 (paused collaborative sync), small-think DR-054 (Oracle Always-Free / persistent-WS analysis), small-think DEPLOY.md (Cloudflare-tunnel wss path) |

## The question

Phase 1 ships local presenter ink. Phase 2 broadcasts that ink, in real time, to
multiple viewers in the same presentation. The standing assumption (FR-025 / DR-154)
was that this is "gated on the WI-028 cost decision" — i.e. flip `SYNC_ENABLED = true`
and ride the existing awareness channel. **This review tests that assumption against
the actual transport code and finds it false in an important way**, then prices the
genuine path.

## Finding 1 — the existing transport cannot carry ink at all (not a cost issue, a capability gap)

The paused WI-028 stack syncs the **document**, not **awareness**:

- `apps/web/api/sync/[roomId]/since.ts` diffs the **Y.Doc** against the caller's state
  vector. `push.ts` appends **Y.Doc updates** to a KV list. There is **no awareness
  route** anywhere in `api/sync/`.
- `@agocraft/sync`'s `createHttpPollProvider` constructs a local `Awareness` object
  (to satisfy the `SyncProvider` interface) but **never sends or receives awareness
  over the network** — its push/pull loop moves only `pendingUpdates` (Y.Doc deltas).
- Presence cursors (WI-028 Phase 4) therefore only ever relayed across clients under
  the **`InMemoryProvider`** (tests). Over the real HTTP-poll transport, awareness is
  inert — a local object that never leaves the browser.

**Consequence:** ink (which is ephemeral awareness, by the DR-154 design) has **no
working cross-client transport today**. Flipping `SYNC_ENABLED` would turn on costly
document polling and *still* not move a single stroke between viewers. Phase 2 needs a
**new transport**, regardless of the cost decision.

## Finding 2 — why WI-028 was paused does NOT apply to Phase 2

WI-028 paused (2026-05-25) because the **1.5 s HTTP poll** (`pullIntervalMs = 1500`)
of `/since` accrued Vercel invocations + Upstash commands against a global-anonymous
workspace faster than collaboration was worth. Quantified:

- Each `/since` poll = 2 Upstash `get` commands (snapshot + updates) + a transient
  Y.Doc hydrate on the function. Each `push` = `get` + `set` of the **whole** updates
  array (O(n), also grows until snapshot compaction).
- Per client: 40 polls/min × 2 = **80 Upstash commands/min** just to pull. Upstash
  Redis free tier ≈ 500 K commands/month → a handful of always-connected editors
  exhausts it; pay-as-you-go is $0.2 / 100 K after.

None of this is on the Phase-2 critical path, because:

1. **Present mode is read-only** — it needs **zero** document CRDT sync. The expensive
   half of WI-028 (polling the Y.Doc) is simply not used.
2. **Ink is ephemeral** — it is never persisted to KV (DR-154). So the Upstash
   command/storage cost for ink is **$0** by construction.
3. **Polling is the wrong tool on both axes** — 1.5 s latency makes live ink feel
   broken, and the per-poll command cost is the very thing that got paused. Ink wants
   **push**, sub-300 ms.

So "the WI-028 cost gate" is a category error for Phase 2: ink doesn't use Upstash,
doesn't poll, and doesn't sync the document.

## Finding 3 — the genuine requirement, and what it costs

Phase 2 = a **persistent, push, low-latency, ephemeral fan-out channel** scoped to a
presentation session. That shape has a known cost profile — the sibling project
already analysed it (small-think **DR-054**), because Aku's reverse-MCP link is the
same shape (persistent WS, always-on):

- **Vercel / serverless cannot host it** — no persistent connections. (DR-054: Cloud
  Run with `min-instances=1` for a WS ≈ **$15–20/mo**; Render free **sleeps** after
  15 min; Fly.io has **no 2026 free tier**, ~$2/mo min.) Vercel SSE-streaming +
  Upstash pub/sub is possible but bills GB-s per connected-viewer-minute + Upstash
  commands — the same cost shape that paused WI-028, now multiplied by audience size.
- **The one genuinely-free fit = a persistent WS server on an always-on box**:
  - **Oracle Cloud Always-Free VM** (DR-054's chosen target) — always-on, no
    scale-to-zero, Ampere ARM core, **10 TB/mo egress free**. Marginal $ = **0**.
  - **The already-running always-on Mac + Cloudflare tunnel** that small-think uses
    today for Aku (DEPLOY.md) — a second WS service on a different path/port behind
    the same `cloudflared`. Marginal $ = **0**, reuses live infra.

**Capacity / bandwidth (trivial):** ink awareness throttled to ~20–30 Hz, ~30–80
bytes/msg (RISK-013 R1 — batch points like cursors, never per-`pointermove`). A
presenter drawing continuously ≈ 2–3 KB/s up; server fan-out to N viewers ≈ 2–3·N
KB/s. 50 viewers ≈ 150 KB/s — negligible against 10 TB/mo egress, and a single
Always-Free core idles thousands of low-rate WS connections.

**Net marginal infra cost for Phase 2 ink ≈ $0** on the persistent-WS-on-free-host
path. The cost the WI-028 pause was about (Upstash polling) is avoided entirely.

## Finding 4 — transport choice: a thin relay beats reusing the Yjs stack

Two ways to build the WS channel:

- **A1 — `y-websocket` server** (carries Y.Doc + Awareness natively). Reuses Yjs;
  requires adding a `WebSocketProvider` to `@agocraft/sync` (the `SyncProvider`
  abstraction already anticipates it, WI-028 §2.4). But it drags in the whole
  document-CRDT machinery present mode doesn't need.
- **A2 — a thin awareness-only WS relay (recommended).** Phase 1 already has its own
  ephemeral `InkStroke` model **and** the `onCommitStroke` / `onErase` producer seam.
  A ~30–50 line WS relay (room → fan-out opaque JSON stroke messages) is all that's
  needed: the client emits an `InkStroke` to the seam, the relay broadcasts it to the
  room, peers render it through the same `InkLayer`. No Yjs on the wire, no document,
  **fully decoupled from the paused WI-028 subsystem**.

A2 is simpler, cheaper to reason about, and correctly reflects that present ink is not
a document-collaboration problem. (This refines DR-154's "rides the awareness channel"
sketch, which assumed reusing Yjs awareness — moot, since that channel never worked
over the network and present doesn't need the document.)

## The real gates (not money)

1. **Ops / reliability of a persistent WS service.** The free path's fragility is
   operational, not financial: Cloudflare **quick-tunnel URLs are ephemeral** (rotate
   on restart → re-point + redeploy), QUIC can be blocked, and the box must stay
   awake (small-think-cloudflare-tunnel-ops). Production needs a **named tunnel +
   stable domain** (`wss://<name>.<domain>`) or the Oracle VM + Caddy/Let's Encrypt.
2. **Net-new product surface: the live session/room model.** Today each viewer loads
   present by URL independently. Multi-user ink needs a "presentation session" —
   presenter starts it, shares a join code/link, viewers connect to the same WS room.
   This is the largest *engineering* item, and it is feature work, not infra.
3. **Authority & reconnect.** Who may draw (presenter-only vs all — RISK-013 R6);
   per-actor color (`colorForActor` exists); WS reconnect/grace (small-think already
   has grace-reconnect patterns to mirror).

## Scope reduction — the cheapest viable Phase 2

**Presenter-broadcast-only (one-way fan-out).** Only the presenter draws; viewers
receive and render. Eliminates multi-writer authority, conflict, and abuse entirely;
the relay is a pure one-way fan-out; the session model collapses to "viewers subscribe
to the presenter's room." This matches the core use case ("presenter annotates,
audience watches") and is the recommended MVP. Two-way collaborative whiteboarding
(everyone draws) becomes a later increment on the same relay.

## Verdict

**FEASIBLE.** Real-time multi-user ink is buildable at **≈ $0 marginal infrastructure
cost** by putting a thin awareness-only WS relay on a free always-on host (Oracle
Always-Free VM, or the existing small-think Cloudflare-tunnel box), riding Phase 1's
existing `onCommitStroke` seam. The long-standing "blocked on WI-028's Upstash cost"
framing is incorrect: ink needs neither Upstash, polling, nor document sync, so the
pause reason does not transfer. The genuine gates are **operational** (running a
reliable persistent WS endpoint — stable domain, not a quick-tunnel) and **product**
(a live session/room model, smallest as presenter-broadcast-only). Recommend
proceeding to a Phase-2 Work Item scoped to the one-way relay + session model, with
the cost question closed (≈ $0) and the decision now an **ops-readiness** call rather
than a billing one.
