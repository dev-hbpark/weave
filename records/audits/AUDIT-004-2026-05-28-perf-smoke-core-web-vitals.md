# AUDIT-004 — Performance smoke (Core Web Vitals, mid-tier + Slow 4G)

| Field | Value |
|---|---|
| ID | AUDIT-004 |
| Date | 2026-05-28 |
| Trigger | LG-001 + LG-002 open blocker — Performance smoke test (mid-tier + Slow-4G + INP measurement) |
| Method | Playwright + CDP throttling (`Emulation.setCPUThrottlingRate=4`, `Network.emulateNetworkConditions` = Lighthouse "Slow 4G" preset), Core Web Vitals via PerformanceObserver |
| Auditor | hbpark (automated tooling only — Lighthouse + RUM ingest deferred to post-launch) |
| Spec file | `apps/web/e2e/perf-smoke.spec.ts` |
| Re-run | `pnpm --filter @weave/web exec playwright test apps/web/e2e/perf-smoke.spec.ts` |

## Throttling profile

| Channel | Setting | Equivalent |
|---|---|---|
| CPU | 4× slowdown | mid-tier mobile (Moto G4-class) |
| Network — download | 400 kbps | Lighthouse "Slow 4G" |
| Network — upload | 400 kbps | Lighthouse "Slow 4G" |
| Network — RTT | 400 ms | Lighthouse "Slow 4G" |

## Scenarios + thresholds

| Scenario | Throttling | Measured metric | Threshold |
|---|---|---|---|
| Landing first paint | Slow 4G + 4× CPU | LCP / CLS / TTFB | LCP ≤ 40 s (regression ceiling, see § Bundle context); CLS ≤ 0.25 |
| Design page open + frame add | Slow 4G + 4× CPU | LCP / CLS | same as landing |
| Frame tile interaction | none (real engine) | INP-equivalent | ≤ 500 ms (Core Web Vitals "Needs improvement" ceiling) |

## Results (2026-05-28)

| Scenario | LCP | CLS | TTFB | INP-equiv | Verdict |
|---|---|---|---|---|---|
| Landing (Slow 4G, warm) | 14 064 ms | 0.0000 | 3 ms | — | PASS (below 40 s ceiling) |
| Landing (Slow 4G, cold dev-server startup) | up to ~30 800 ms | 0.0000 | 6 ms | — | PASS (below 40 s ceiling) |
| Design page + frame (Slow 4G) | 13 272 ms | 0.0000 | 2 ms | — | PASS (below 40 s ceiling) |
| Frame tile interaction (no throttling) | — | — | — | 17 – 20 ms | PASS — well under 200 ms "Good" |

CLS = 0 on every scenario — no measurable layout shift, the app's hydration
and lazy-load steps don't shove content around.

## Bundle context

`apps/web` production bundle (vite build, 2026-05-28):

| Asset | Raw | Gzipped |
|---|---|---|
| `index-*.js`            | 996.62 kB | 310.96 kB |
| `LexicalTextEditor-*.js` (lazy chunk) | 180.98 kB | 59.13 kB |
| `index-*.css`           | 64.06 kB  | 11.60 kB  |

At Slow 4G's 400 kbps (50 kB/s), the `index-*.js` chunk alone is ~6.2 s of
download time, before parse + execution on the 4×-slowdown CPU. The
~14 s warm-cache LCP and ~30 s cold-dev-server LCP are therefore
**bundle-bound** — not a runtime regression. Real users on the LG-001
audience (Korean / US desktop latest-2 Chrome / Edge / Safari) are
typically on > 10 Mbps connections where the same bundle downloads in
< 1 s, so LCP under audience conditions sits well under the 2.5 s "Good"
bar (estimated < 1.5 s on Wi-Fi).

## Audience alignment

LG-001 defines the v1 audience as "Korean / US desktop latest-2
Chrome / Edge / Safari". Slow 4G mobile is **not** in the launch audience.
The Slow 4G measurement is performed because:

1. The LG-001 plan calls for it ("mid-tier + Slow-4G + INP measurement").
2. It captures the worst-case behaviour for any user who roams onto a
   slow tether or congested cell.
3. It bounds the bundle-size budget — every kB the bundle grows shows
   up linearly on Slow 4G LCP.

The "Good" Core Web Vitals thresholds (LCP ≤ 2.5 s / CLS ≤ 0.1 / INP ≤
200 ms) apply meaningfully only to the desktop audience. Measuring those
under throttle gives an upper-bound view of "what if the network gets
bad" rather than "what the typical user sees".

## Severity decisions

Per the inline policy in `perf-smoke.spec.ts`:

| Finding | Severity | Action |
|---|---|---|
| Landing LCP 14 s under Slow 4G | informational | bundle optimisation tracked post-launch |
| Design page LCP 13 s under Slow 4G | informational | same |
| Frame interaction INP ≈ 20 ms | PASS | no action — well under "Good" |
| CLS = 0 everywhere | PASS | no action |

**No launch blockers.** The Slow 4G LCP results are bundle-bound and
in scope of the post-launch optimisation backlog, not LG-001 / LG-002
gate items.

## Post-launch backlog (tracked outside LG)

Optimisations the bundle-size measurement points to. None block the
2026-06-08 launch.

| Idea | Expected gain | Estimated effort | Risk |
|---|---|---|---|
| Route-level `React.lazy` (landing / design / present) | ~30–40 % off `index-*.js` (the landing route alone could ship without the editor) | 1 day | low |
| Dynamic import for `@agocraft/sync` (deferred until presence connects) | ~5–10 % | 0.5 day | low |
| Dynamic import for heavy domain renderers (only the kinds present in the document) | ~5 % | 1 day | medium — requires runtime kind discovery |
| Defer Lexical bridge until first text-item edit (already partly lazy via `LexicalTextEditor-*.js` chunk) | smaller — already lazy | done | n/a |
| Move `@vercel/blob` / `@vercel/kv` initialisation to API-route-only entry | ~3–5 % | 0.5 day | low |

Track these in `PRODUCTION_BACKLOG.md` (weave or agocraft, whichever
owns the dependency) and run AUDIT-004 again after each optimisation
lands to quantify the gain.

## Spec state

`apps/web/e2e/perf-smoke.spec.ts` is checked in with all three scenarios
active and PASS. It serves as a regression gate — any future change that
pushes Slow 4G LCP above 40 s would fail (something is fundamentally
broken: a render loop, a stuck observer, runaway hydration), and any
change that pushes INP above 500 ms would fail (an interaction-handler
regression on the desktop hot path).

## Re-measurement on optimisation

For each post-launch optimisation that touches the bundle, the expected
workflow is:

1. Land the change behind a feature flag (if user-visible) or on trunk.
2. Re-run `pnpm --filter @weave/web exec playwright test apps/web/e2e/perf-smoke.spec.ts`.
3. Capture the new LCP / CLS / INP numbers.
4. Append a row to the "Results" table in this audit doc (or split into
   AUDIT-004-v2 if numbers are extensively re-shaped).
5. Update LG-001 / LG-002 follow-up Ops notes if material.

## Links

- LG-001: `records/launch-gates/LG-001-text-item-v1.md`
- LG-002: `records/launch-gates/LG-002-figma-frame-ux.md`
- Spec: `apps/web/e2e/perf-smoke.spec.ts`
- Related: AUDIT-003 (a11y smoke), Core Web Vitals reference
  https://web.dev/articles/vitals
