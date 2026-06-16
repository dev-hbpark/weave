# LG-003 C2 — Live gate runbook (Phase 2 two-browser whiteboard)

Closes condition **C2** of [LG-003](LG-003-present-whiteboard-ink.md): verify that a
presenter's ink broadcasts in real time to a viewer over the relay, the viewer follows
the presenter's slide, and the channel survives a reconnect. Two parts: an **automated
harness** (`apps/web/e2e/present-live-ink.spec.ts`) and a **manual checklist** for what
automation can't cover (real network, real second device, latency feel).

## Prerequisites

- **C1 done** — small-think server redeployed with the `/relay` path live (WI-061 / DR-074).
  ⚠️ A *pre-C1* server has no path routing and swallows `/relay` into the Aku handler, so
  the gate fails even though "Go live" renders. C2 genuinely requires C1.
- A reachable relay endpoint, one of:
  - **Tunnel** — the deployed small-think tunnel; weave derives `<aku-origin>/relay` from
    `VITE_AKU_AGENT_URL` (already in `apps/web/.env`), or set `VITE_WEAVE_RELAY_URL`.
  - **Local** — a standalone relay on localhost (below), for infra-free verification.

## Part A — Automated harness

The spec opens a presenter + a viewer (two tabs, one browser context = shared workspace),
goes live, draws, and asserts the viewer renders the stroke and the clear. It is **opt-in**:
it skips unless `WEAVE_LIVE_GATE=1`, so normal/CI runs never fail on un-deployed infra.

### A1 — Local mode (no tunnel needed)

```bash
# 1) Build + run a standalone relay from small-think (LLM-free; just the fan-out).
cd workspace/small-think/packages/link && npx tsup           # if dist is stale
cat > /tmp/relay.mjs <<'JS'
import { createWebSocketServer, createRoomRelay } from "@small-think/link/server";
const relay = createRoomRelay();
createWebSocketServer({
  port: 7799,
  onConnection: () => {},                       // no Aku in this standalone relay
  routes: [{ path: "/relay", onConnection: (sock, url) => {
    const room = url.searchParams.get("room") ?? "";
    if (/^[A-Za-z0-9_-]{1,64}$/.test(room)) relay.join(room, sock); else sock.closeRaw();
  }}],
});
console.log("relay up on ws://localhost:7799/relay");
JS
node /tmp/relay.mjs &                            # leave running

# 2) Run the gate. Ensure nothing is already serving :5179 (else it's reused
#    without the env). Playwright starts the dev server inheriting these vars.
cd workspace/weave/apps/web
VITE_WEAVE_RELAY_URL=ws://localhost:7799/relay WEAVE_LIVE_GATE=1 \
  npx playwright test e2e/present-live-ink.spec.ts --reporter=line --workers=1
```

Expected: **1 passed** (presenter stroke reaches the viewer; clear empties it).

### A2 — Tunnel mode (real path, post-C1)

```bash
# VITE_AKU_AGENT_URL in apps/web/.env already points at the tunnel; after C1 the
# /relay path is live through it. (Kill any stale :5179 dev server first.)
cd workspace/weave/apps/web
WEAVE_LIVE_GATE=1 npx playwright test e2e/present-live-ink.spec.ts --reporter=line --workers=1
```

Expected: **1 passed**. A failure here with `viewerMark count 0` means the relay path
isn't actually fanning out → C1 not deployed (or the tunnel is down — see Troubleshooting).

## Part B — Manual checklist (human-in-the-loop)

Run against the tunnel with two **real, separate browsers/devices** (not two tabs), so the
checks exercise real network. Presenter: open a deck in present mode → **Go live** → copy
the viewer link. Viewer: open the link.

- [ ] **Connect** — viewer chip shows "Live — following presenter" (not stuck on "Connecting…").
- [ ] **Draw broadcast** — presenter draws; the stroke appears on the viewer within ~1s,
      anchored to the same place on the slide (not offset).
- [ ] **Zoom/pan anchor** — strokes stay glued to slide content on both sides.
- [ ] **Highlighter / eraser** — translucent stroke + erase both propagate.
- [ ] **Clear** — presenter "Clear slide" empties the viewer's slide.
- [ ] **Undo is presenter-local (v1)** — presenter undo removes the stroke on the
      presenter only; the viewer keeps it (documented v1 limitation; "Clear" is the
      shared reset). Not a bug.
- [ ] **Step follow** — presenter advances slide (→); viewer's slide follows.
- [ ] **Multi-viewer** — a second viewer on the same link also receives ink.
- [ ] **Reconnect** — drop the viewer's network ~5s then restore; the chip returns to
      "Live" and *new* strokes resume (past strokes are not replayed — expected, ephemeral).
- [ ] **Opt-out integrity** — open the deck in present mode *without* `?session` and
      *without* clicking Go live → no socket opens, plain present works (R7).
- [ ] **Board is presenter-local (v1)** — presenter opens the blank board and draws; the
      viewer does NOT see board ink (documented v1 limitation, not a bug).
- [ ] **Latency feel** — drawing feels live (stroke-level, on pen-up), acceptable for a talk.

## Pass / fail → closing C2

- **PASS** = Part A green (local or tunnel) **and** every Part B box checked against the
  tunnel. Record the run date + tester in LG-003, flip C2 to closed, re-evaluate the LG
  verdict (Phase 2 → Ready once C2 + C3 close).
- **FAIL** = any unchecked box or a red harness. Capture the symptom; if it's
  "viewer receives nothing," confirm C1 (redeploy) and the tunnel first.

## C2 run log

- **2026-06-16 — first run FAILED, two real issues found & fixed (Continuous
  Self-Verification working as intended):**
  1. **Client bug (fixed):** the publishing Decorator read `base.strokes()` to build a
     `sync` message — but that read is stale immediately after a `useReducer` dispatch,
     so clear/erase published the *pre*-mutation state and never cleared the viewer. Fix:
     the wire protocol is now derived from the mutation args only (`stroke`/`erase`/
     `clear`, no read-back); `sync` removed; undo/redo are presenter-local in v1. Harness
     then PASSES.
  2. **Config mismatch (operator action):** the harness connected to
     `ws://localhost:8789` — a **stale old-code** agent-server with no path routing
     (swallows `/relay`). The **redeployed new-code** server is on `ws://localhost:8788`
     (launchd `PORT=8788` + the cloudflared tunnel → localhost:8788). weave's
     `VITE_AKU_AGENT_URL` points at the stale **:8789**. Pointed at :8788, the full stack
     (draw → viewer render → clear) PASSES.
  - **Operator to close C2:** make weave's relay endpoint resolve to the new-code server
    — repoint `VITE_AKU_AGENT_URL` (or set `VITE_WEAVE_RELAY_URL`) to the **:8788** server
    / its tunnel, or retire the stale **:8789** instance. Then re-run Part A (expect pass)
    + Part B.

## Troubleshooting

- **Viewer gets nothing / harness `count 0`** — almost always (a) the relay endpoint is an
  old/stale server without path routing (swallows `/relay`) — confirm which PORT the app
  connects to vs which port runs the new code; or (b) C1 not deployed; or (c) tunnel down.
  Verify: `wscat -c "<relay-url>/relay?room=t"` connects, and a second client in the same
  room receives what the first sends. (The new-code server fans out; a pre-C1 server does
  not.)
- **"Go live" missing** — relay URL unresolved: neither `VITE_WEAVE_RELAY_URL` nor
  `VITE_AKU_AGENT_URL` set in the running dev server's env (a stale `:5179` server reused
  without the env is the usual cause — restart it).
- **Tunnel flakiness / NXDOMAIN / QUIC** — see [[small-think-cloudflare-tunnel-ops]]:
  ephemeral quick-tunnel URL rotates on `cloudflared` restart (update the env + redeploy),
  QUIC-block → `--protocol http2`, kickstart to recover the service.
