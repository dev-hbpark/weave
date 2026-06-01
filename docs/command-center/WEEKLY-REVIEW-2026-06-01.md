# Weekly Operating Review — 2026-06-01 (week of 05-25 → 06-01)

| Field | Value |
|---|---|
| Anchor project | weave (flagship; consumes agocraft core + small-think agent backend) |
| Scope | weave + agocraft + small-think (one product family, coordinated from OS-root) |
| Cadence note | **First weekly review** — no prior-week named outcomes to measure against; this entry establishes the baseline. Next review measures against §7. |
| Author | claude (Opus 4.8) |

---

## 1. Product progress

Measured against the record trail (no prior weekly outcomes exist yet).

| Outcome | Evidence | Verdict |
|---|---|---|
| `line` as a distinct top-level item kind | WI-062 **완료** (Phase 1–6, agocraft+weave tsc green, 7 migration unit + 6 e2e green) | ✅ shipped |
| Freeform `poly` shape + vertex editing | WI-057 / WI-061 (poly vertex add/remove, rotation-aware, 45° snap precision) | ✅ shipped |
| Data-driven QR code item | WI-058 (weave-local, agent-friendly) | ✅ shipped |
| Decoration-as-units convergence | DR-028 cluster (fill/stroke/shadow/opacity/filter panel + render converged onto units) | ✅ shipped |
| MVVM View↔domain-logic separation | WI-063 **In Progress** (View-resident domain math extracted to pure modules — commit `298e078`) | 🟡 in flight |
| Code-structure integrity (Rule 6 / SOLID-GRASP) | AUDIT-005 / AUDIT-006 (MVVM) / **AUDIT-007 (CLOSED)** | ✅ this week's headline |

Net: a strong shipping week on the canvas primitive surface (line/poly/qr) **and** a deep structural-quality pass. The product moved on both features and foundations.

## 2. Risks

| Risk | Review-by | Status |
|---|---|---|
| **RISK-003** corner-radius direct-drag | **2026-06-01 (TODAY)** | ⚠️ **review-by reached — needs explicit review this cycle** (see §7) |
| RISK-004 frame-only paradigm | 2026-06-08 (T-0) | on track (review next week) |
| RISK-005 figma-frame UX adoption | 2026-06-08 (T-0) | on track (review next week) |
| RISK-002 slide-layout presets | 2026-06-15 | on track |
| RISK-010 shape-gradient-fill (newest) | — | open, recent |

No risk aged *past* its review-by silently — RISK-003 lands exactly on its date and is flagged here rather than rolled forward.

## 3. Engineering

- **In-flight**: WI-063 (MVVM View↔domain extraction) — continuation of the AUDIT-006 finding. Owner to define done-criteria + remaining View files.
- **Closed this week**: WI-062 (line kind), WI-057/061 (poly), WI-058 (qr), AUDIT-007 (Rule 6 gate drift + 6 violations refactored across 3 repos).
- **Code-structure gates**: `check_declarative_dispatch.sh` is now (a) drift-free — OS-root + template + 3 project copies byte-identical, and (b) broadened to catch bare/camelCase `switch (kind)` that previously evaded it. 3 project gates green.
- **Dependency / library decisions pending**: none new this week.
- **Known engineering debt (recurring — surfaced AUDIT-005 §5 & AUDIT-007)**: the **e2e persistence-test environment gap** — `playwright webServer: pnpm dev` (Vite) does not serve the Vercel `api/designs/*` routes, so the 2026-05-29 cloud-authoritative persistence model makes ~29 persistence-dependent e2e tests fail locally (render/interaction tests — 279 — still green). This blocks Continuous Self-Verification for persistence-touching changes. **→ actioned as WI-064 (§7).**

## 4. Ops & Customer Success

- No customer-facing ops events this week.
- **Security posture reminder (unchanged)**: weave deploy is still a single shared anonymous workspace (no auth, `shared:` KV prefix) — see `apps/web/CLAUDE.md`. Not a regression, but remains a launch-blocking item before any public sign-up.
- SLO/oncall: not yet instrumented (pre-launch).

## 5. Incidents

- **None.** `records/incidents/` empty this week. No SEV, no rollback.

## 6. Agent quality

- **Fired this week**: `claude` (Opus 4.8) main loop + 3 parallel `general-purpose` subagents for the AUDIT-007 cross-project blind-spot sweep (weave / agocraft / small-think). All three returned actionable, source-verified findings; the human verified each before refactor (no hallucinated finding shipped).
- **Gate scripts exercised**: `check_declarative_dispatch.sh` across 3 projects — surfaced the gate-drift false-green and, after broadening, 2 new permitted-exception sites (correctly allowlisted).
- **Routing/agents stale?**: the broadened gate header now documents its own backstop limits (object catalogues, sibling-if, membership chains, non-six-word discriminants remain code-review-only). No agent failures this week.
- **No AGENT_EVALUATION record needed** — no agent under-performed.

## 7. Next-week priorities (concrete, owned)

1. **Review RISK-003 (corner-radius direct-drag)** — review-by is today; produce a verdict (mitigated / accept / extend) and a new review-by date. Owner: design+eng. *(risk review, not new WI)*
2. **WI-063 (MVVM extraction)** — land remaining View↔domain extractions per AUDIT-006; define explicit done-criteria. Owner: web.
3. **WI-064 (NEW)** — close the e2e persistence-test environment gap so persistence-dependent specs run green in CI (`vercel dev`-class api backend under playwright, or a KV/api mock). Unblocks SVL for persistence changes. Owner: web/infra.
4. **RISK-004 / RISK-005 review** — both review-by 2026-06-08; pre-stage so they don't slip.

### Rolled-forward items
- None (first review — clean slate). Future reviews must list any §7 item not delivered.

---

*Records touched: this review (`docs/command-center/`); follow-up `WI-064` created. AUDIT-007 CLOSED. No decision/risk/launch/handoff record changed by the review itself.*
