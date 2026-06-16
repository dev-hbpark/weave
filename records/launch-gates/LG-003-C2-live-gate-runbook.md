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
- [ ] **Undo** — presenter undo re-syncs the viewer (stroke removed).
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

## Troubleshooting

- **Viewer gets nothing / harness `count 0`** — almost always C1 not deployed (old server
  swallows `/relay`) or the tunnel is down. Verify: `wscat -c "$VITE_AKU_AGENT_URL/relay?room=t"`
  connects, and a second client in the same room receives what the first sends.
- **"Go live" missing** — relay URL unresolved: neither `VITE_WEAVE_RELAY_URL` nor
  `VITE_AKU_AGENT_URL` set in the running dev server's env (a stale `:5179` server reused
  without the env is the usual cause — restart it).
- **Tunnel flakiness / NXDOMAIN / QUIC** — see [[small-think-cloudflare-tunnel-ops]]:
  ephemeral quick-tunnel URL rotates on `cloudflared` restart (update the env + redeploy),
  QUIC-block → `--protocol http2`, kickstart to recover the service.
