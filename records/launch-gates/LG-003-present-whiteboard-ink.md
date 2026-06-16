# Launch Gate — LG-003 Present-mode whiteboard ink (WI-239 + WI-240)

| Field | Value |
|---|---|
| ID | LG-003 |
| Launch | Feature merge + user visibility on the deployed weave instance |
| Audience | weave's current anonymous shared-workspace users (desktop latest-2 Chrome/Edge/Safari) |
| Scheduled T-0 | Phase 1 — on merge to production. Phase 2 — after named conditions close (no fixed date; ops-gated) |
| Owner | hbpark (single accountable) |
| Incident Commander on standby | hbpark |
| Inputs | WI-239 / WI-240, DR-154 / DR-155, FR-025 / FR-026, RISK-013; small-think WI-061 / DR-074 / HANDOFF-032 |

## Scope

Two phases, deliberately decoupled (DR-154 / DR-155):

- **Phase 1 (WI-239) — local presenter ink + blank board.** Ephemeral annotation over
  present mode; **no document mutation** (present stays read-only), **no persisted /
  serialized data**, **no new outbound connection**. Additive.
- **Phase 2 (WI-240) — presenter-broadcast live sessions** over the small-think `/relay`
  WS path (reused tunnel). **Opt-in and dormant by default**: the "Go live" UI only
  renders when `VITE_WEAVE_RELAY_URL` (or `VITE_AKU_AGENT_URL`) resolves — that env IS
  the Phase-2 kill switch. With it unset, the merged code ships Phase 1 only and Phase 2
  is invisible / opens no socket.

**Ramp**: single additive merge → Phase 1 immediately user-visible. Phase 2 stays off
until the relay env is configured AND the conditions below close.

**Reversibility**: single revert PR (the feature is self-contained under
`features/present/ink/` + a neutral `overlay` slot on Stage + opt-in PresentPage wiring).
Phase 2 alone is reversible by unsetting the relay env (instant, no deploy of weave).

---

## Pillar 1 — Product

- [x] Acceptance criteria met — Phase 1: ink follows camera zoom/pan, pen/highlighter/
  eraser, per-step + board surfaces, undo/redo, opt-in mode gate. e2e 3/3 (gate /
  draw+undo / board). Phase 2: presenter publish → viewer render + step-follow
  (logical wire round-trip + relay integration verified).
- [x] User-facing copy reviewed — toolbar labels + viewer "following" chip; no
  placeholder strings. (English only — consistent with present-mode chrome; locale
  parity not a blocker for this surface.)
- [x] Empty / error / connection states — viewer "Connecting to live…" vs "Live —
  following presenter"; relay-unavailable → no live UI (clean absence).
- N/A Pricing / disclosures (no commerce).

**Status: Ready** (both phases).

---

## Pillar 2 — Risk & governance

- [x] Risk basis = **RISK-013** (R1–R7); all residuals LOW/MEDIUM, none Critical/High.
  R1 (cost) downgraded to ≈ $0 (FR-026). R7 (present WS surface) mitigated by opt-in.
- [x] No open Critical or High severity items.
- [x] Privacy — ink is ephemeral, never persisted; no PII; rides the existing
  global-anonymous model unchanged. No new personal-data collection.
- [x] Security (internal review of own surface) — Phase 2 relay is **unauthenticated by
  design** (roomId is the only capability, consistent with the no-accounts shared
  workspace), **domain-neutral**, **ephemeral**, and **bounded** (max rooms 256 /
  members 64 / msg 64K / 240 msg·s⁻¹ → close). No secrets transit the relay. Outbound WS
  is opt-in only. **(OR)** external penetration test — deferred.
- N/A AI safety (no AI surface).
- [x] Legal / policy — no terms change (ephemeral, no data retention).

**Status: Ready** — residual risks accepted at launch (RISK-013); the unauthenticated
relay is an explicit, scoped acceptance matching weave's current security model
(apps/web/CLAUDE.md), revisited if/when accounts land.

---

## Pillar 3 — Engineering

- [x] ENGINEERING_PLAN (WI-239 P1–P6, WI-240 P0–P5) complete; out-of-scope items
  (two-way whiteboarding, board broadcast, late-joiner replay) explicitly deferred to
  follow-up WIs with owner = hbpark.
- [x] Feature flag / kill-switch — Phase 1: opt-in mode gate (`useInkMode`, default off).
  Phase 2: relay-env presence is the kill switch; unset → dormant (verified by
  `resolveRelayUrl` returning null and the Phase-1 e2e passing with relay unconfigured).
  Kill-switch **unit/e2e-tested** (Phase-1 non-regression with live off). **(OR)** tested
  in real staging.
- [x] No migrations — no persisted-schema or DB change (ephemeral, in-memory only).
- [x] Dependencies — no new third-party runtime dependency (relay uses node `ws` already
  present in small-think; weave client uses the platform `WebSocket`). No new CVE surface.
- [x] Code-structure gates — weave typecheck + biome clean; small-think typecheck +
  depcruise (`ws` confined) + declarativecheck (Rule 6) + biome clean.
- [x] Cross-project — small-think WI-061/DR-074 landed (HANDOFF-032), merged to main.

**Status: Ready** (code). Phase-2 *activation* depends on Pillar 5 ops items (below).

---

## Pillar 4 — QA

- [x] Test cases executed — weave: 23 ink/relay unit (Phase 1: 11; Phase 2: 12) + full
  suite **1457 green**; present-ink e2e **3/3**. small-think: 23 link unit + **real-WS
  relay integration 6/6**. Pass rate 100% on must-pass set; no Sev1/Sev2 open.
- [x] Regression suite green on the release branch (merged to weave/small-think main).
- [x] **Serialization round-trip (Rule 5)** — no persisted/KV/document schema is touched
  (ink is ephemeral). The Phase-2 **wire contract** (`SessionMessage`) HAS a round-trip
  test (encode→decode equality) AND `decodeSessionMessage` rejects malformed / **unknown
  tags** (forward-compatible — unknown kinds ignored, not crashing). ✅
- [~] Accessibility — toolbar/controls carry `aria-label` / `aria-pressed`; core present
  flow (keyboard nav, advance) unchanged. **Smoke-level pass**; no full WCAG 2.2 AA audit
  run on the new surface — accepted as a residual (non-blocking; ink is a presenter aid).
- [x] Performance smoke — ink = SVG paths on a read-only Stage (no layout-engine
  coupling); live broadcast throttled to cursor-level rate. No LCP/INP regression on the
  present route (the e2e draw/zoom path is interactive < frame budget). **(OR)**
  production RUM ingest.
- [x] Manual exploratory — draw/zoom-anchor/eraser/board/undo verified live during build
  (Phase 1). Phase-2 two-browser exploratory = the one open condition (below).

**Status: Ready (Phase 1); Conditional (Phase 2)** — pending the manual two-browser live
gate.

---

## Pillar 5 — Operations

- [x] Rollback — Phase 1: revert PR. Phase 2: unset relay env (instant, no weave deploy).
  Documented here; unit/e2e-validated (non-regression with live off).
- **Phase-2 activation prerequisite (in-scope condition, not (OR)):** small-think server
  **redeploy** (rebuild dist + restart launchd) so `/relay` is live — owner hbpark.
- **(OR)** Monitoring / alerts for the relay (connection count, room count) — deferred,
  Operational Readiness not open.
- **(OR)** Oncall for launch window + war-room — deferred.
- **(OR)** Rollback tested in real staging — deferred (unit/e2e level only).
- **(OR)** Capacity / load test at 3× peak — deferred (relay is bounded; Always-Free VM
  headroom is large for cursor-rate ink, but not load-tested).
- [x] Cost cap — Phase 2 marginal infra ≈ $0 (FR-026: no Upstash, reused always-on host,
  10 TB/mo egress free). No new metered line item → no budget alert needed.

**Status: Conditional (Phase 2)** — server redeploy is the named in-scope condition;
monitoring/oncall/load are deferred (OR).

---

## Pillar 6 — Communications

- [x] Internal note — single-owner project; the WI/DR/LG records are the internal trail.
- **(OR)** External announcement (blog / status page) — deferred.
- **(OR)** Support briefing — deferred (no support team staffed).
- [x] Incident-scenario (internal) — rollback = revert PR / unset relay env (above).

**Status: Ready** (in-scope items).

---

## Pending Operational Readiness (deferred (OR) — not in scope, do not block)

- Relay monitoring/alerts; launch-window oncall + war-room; real-staging rollback test;
  3× load test; production RUM ingest; external pen test; external announcement; support
  briefing. All `deferred — pending Operational Readiness open`.

## Open conditions (in-scope, gate Phase 2 only)

| # | Condition | Owner | ETA |
|---|---|---|---|
| C1 | small-think server **redeploy** (dist) so `/relay` is live | hbpark | next deploy window |
| C2 | Manual **two-browser live gate** over the tunnel (presenter draws → viewer sees + follows; reconnect) | hbpark | after C1 |
| C3 | Set `VITE_WEAVE_RELAY_URL` (or confirm `VITE_AKU_AGENT_URL` reachable) + weave redeploy to surface "Go live" | hbpark | after C2 passes |

## Verdict

**CONDITIONAL READY.**

- **Phase 1 — READY.** Ships immediately on merge: additive, reversible, no document /
  schema / persistence / connection impact, all six pillars Ready. Already merged to main
  (weave 59398c8) and safe to deploy as-is (Phase 2 dormant without the relay env).
- **Phase 2 — CONDITIONAL.** Code is Ready and verified to the integration level; live
  activation is gated on C1–C3. Because Phase 2 is dormant-by-default, **merging/deploying
  now carries no Phase-2 risk** — Phase 2 simply stays invisible until its conditions
  close. Re-check this gate at Phase-2 T-0 (after C2 passes).

Special case check: no `risk-governance-review` HOLD/NO-GO on record (RISK-013 residuals
all LOW/MEDIUM) → gate is not auto-blocked.

## Sign-off

| Pillar | Signer | Verdict | When |
|---|---|---|---|
| Product | hbpark | Ready | 2026-06-16 |
| Risk & governance | hbpark | Ready | 2026-06-16 |
| Engineering | hbpark | Ready (Phase-2 activation = ops-gated) | 2026-06-16 |
| QA | hbpark | Ready (P1) / Conditional (P2 — C2) | 2026-06-16 |
| Operations | hbpark | Conditional (C1) | 2026-06-16 |
| Communications | hbpark | Ready | 2026-06-16 |
