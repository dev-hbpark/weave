# Technical Feasibility Review — FR-001

## Metadata

| Field | Value |
|---|---|
| ID | FR-001 |
| Title | horizontal multi-domain workspace (slide + canvas + block-doc + media) 의 production-grade B2B SaaS 구현 |
| Reviewer agent | `technical-feasibility-agent` |
| Triggering Work Item | WI-001 |
| Date | 2026-05-22 |
| Verdict | **FEASIBLE WITH TRADE-OFFS** |
| Review-by | 2026-08-31 (M4 closed beta 결과로 재검토) |

## 1. Outcome restated (testable)

> **20 명 SMB 팀** 이 한 doc 안에 **slide + canvas + block-doc + media** 4 도메인을 자유 임베드한 산출물을 만들고, **저장·공유·기본 협업 (last-write-wins + lock)** 까지 도달한다.
>
> - Doc 사이즈: ≤ 200 Item, ≤ 50 페이지 / 캔버스 영역.
> - 첫 페인트 INP < 200ms (50th percentile), < 500ms (90th percentile).
> - Doc 저장 / 로드 round-trip < 2s (50%), < 5s (90%).
> - 동시 편집자: ≤ 5 (M2). M3 부터 ≤ 20.
> - 첫 launch geography: 한국·미국 desktop browsers (Chrome / Edge / Safari latest 2 versions).

## 2. Capability requirements

| Capability | Best-known result (cite) | Gap to requested outcome |
|---|---|---|
| 4 도메인 mixed-domain editing model | **agocraft (this workspace)** — WI-001~006, 12 packages, 454 unit + 20 e2e GREEN. Composite tree + Capability dispatch + StyleCascade. PoC 완료 | 없음. weave 가 흡수. 단 production wiring (storage upload / blob revoke / magic-byte) 은 agocraft `PRODUCTION_BACKLOG.md` 우선순위 0 미해결 |
| HTML canonical rendering + Canvas fallback | DR-012 박제. Chromium drawElement origin trial (deferred until stable) | 없음. agocraft 의 renderer-html / renderer-canvas2d 가 답 |
| 멀티-tenant data model + workspace + ACL | Notion / Figma / Linear 가 SOTA. open-source: Cal.com, Triangle, Twenty CRM | weave 의 own 구현 필요. 표준 패턴 (org → workspace → doc → member + role-based ACL). **새로움 없음 — 구현 시간만 든다** |
| 실시간 협업 (CRDT or OT) | Yjs (CRDT) production-ready. Liveblocks / Partykit / Hocuspocus 서버 | M0–M2 는 last-write-wins + lock. **M3+ 별도 WI**. agocraft 의 ChangeStream + transaction id 가 CRDT/Yjs 통합점 (이미 설계됨) |
| File / asset storage (이미지·비디오 업로드) | S3 + presigned URL + CDN 표준. 또는 R2 / Backblaze. magic-byte 검증 = `file-type` lib | 없음. 표준 인프라. agocraft 의 R-13/R-15/R-16/R-17 박제 |
| HLS / DASH 비디오 streaming | hls.js / dash.js peer dep. iOS native | agocraft WI-004 의 streamingHandler slot 이 답. host wire 만 필요 |
| 검색 (semantic + keyword) | Postgres FTS or Typesense / Meilisearch. embedding (OpenAI / Voyage / local) | M2 까지는 keyword FTS 만. semantic search 는 별도 WI |
| 공개 페이지 (template / showcase / blog) SEO + AI visibility | Next.js / Astro SSG. structured data + LLM-friendly schema | 없음. SEO 표준 + AI visibility plan 의 docs/seo 박제 |
| Auth (회원가입 + SSO + invite) | Clerk / WorkOS / Auth0 / Supabase Auth | 의존 결정 필요. **DR-002 후보**. SSO 는 enterprise tier 때. SMB freemium 은 email + Google + Microsoft SSO 시작 |
| 결제 / billing (PRO tier) | Stripe / Lemonsqueezy / Paddle. per-seat metering 표준 | M4+ 별도 WI. 첫 단계 freemium 만 |
| 공개 가입 / waitlist | Loops / ConvertKit / 자체 mailchimp-like | 자체 minimal 으로 시작. M2 |
| Frontend platform | React 18 + Vite + TypeScript strict + pnpm. agocraft 와 동일 | 없음. 결정됨 |
| Backend platform | **결정 필요 — DR-003 후보**. options: (a) Node + Hono + Drizzle + Postgres / (b) Cloudflare Workers + D1 / (c) Supabase + Postgres / (d) Convex (BaaS) / (e) Rails (안전한 표준) | 어느 쪽이든 FEASIBLE. cost / cold-start / SLO trade-off 다름 |

## 3. Intrinsic limits checked

- [ ] Speed of light / network round-trip floor — **OK** (한국·미국 1 region 각각, < 100ms RTT 가능)
- [ ] Information-theoretic bounds — 해당 없음
- [ ] Learning theory — AI 없음 (initial)
- [ ] Bayes optimal error — 해당 없음
- [ ] Halting problem / undecidability — 해당 없음
- [ ] Identifiability — 해당 없음
- [ ] Privacy-utility trade-off — multi-tenant 표준. **per-tenant 격리 의무** (`privacy-data-protection-agent` 사인)
- [x] Hardware ceiling — **데스크탑 Chrome 16GB 머신 ≤ 200 Item doc 까지 INP 보장**. 그 이상은 agocraft 의 `rendering-performance-architecture-agent` 3 차 council 의무 (PRODUCTION_BACKLOG 우선순위 4)
- [ ] Quantum / cryptographic floor — 해당 없음
- [ ] Other — N/A

## 4. Unavoidable trade-offs

| Axis | weave lands at | Cost of moving |
|---|---|---|
| Accuracy ↔ latency | latency 우위 (INP < 200ms 50%). 첫 paint 의 visual fidelity 는 100% 정확보다 90% 도 OK (final paint 로 보정) | 100% pixel-perfect 첫 paint 요구 시 SSR + critical CSS / 추가 30% 빌드 복잡도 |
| Accuracy ↔ cost | cost 우위. 첫 stage 는 single-region Node + Postgres 1 instance | global low-latency 요구 시 Cloudflare workers + D1 / Turso / global Postgres. cost 1.5–3× |
| Accuracy ↔ privacy | 한국 / 미국 region per-tenant 격리. enterprise 의 dedicated instance 는 M5+ | enterprise 의 BYO-key / VPC peering 등은 분기 dedicated infra (cost ↑) |
| Coverage ↔ precision | coverage 우위 — 4 도메인 모두 "good-enough", 1 도메인 pixel-perfect 아님 | Figma 의 디자인 깊이를 따라잡으려면 design system / Auto Layout / interactive prototyping 2y+ 추가 빌드 |
| Determinism ↔ adaptability | adaptability 우위 — Capability + Extension Point (DR-005 of agocraft) 가 plugin 자유도 |  |
| Compute ↔ device class | desktop 우위. 모바일은 view-only | 모바일 편집 = WebView/PWA 또는 native. 6mo+ 추가 |
| Real-time ↔ batched | **M0–M2 batched (last-write-wins + lock)**, M3+ real-time (Yjs/Liveblocks) | M0 부터 real-time 하면 backend 복잡도 2× + cost 1.5× |

## 5. Scope-reduction options (referencing)

verdict 가 FEASIBLE WITH TRADE-OFFS 이라 의무 아님. 단 product 가 수용해야 할 reduction:

- [x] Narrow the input class to: **desktop Chrome/Edge/Safari latest 2 + 한국·미국 region** (mobile/firefox 는 later)
- [x] Lower the quality bar to: **first paint 100% pixel-perfect 아님** (90% + final paint 보정)
- [x] Restrict the audience to: **5–20 명 SMB 팀** (enterprise 50+ seats 는 M5+)
- [x] Change the modality to: **편집 = 데스크탑만, 모바일 = view-only**
- [x] Defer until: **실시간 multi-cursor = M3+ 별도 WI 발행 후**

## 6. Verdict

- [ ] FEASIBLE
- [x] **FEASIBLE WITH TRADE-OFFS** — 4 도메인 통합 자체 (USP) + 표준 multi-tenant SaaS infra 는 FEASIBLE. agocraft 가 frontend editing engine 의 ~70% 를 흡수. 단 (a) M0–M2 협업은 last-write-wins, (b) 모바일 view-only, (c) AI 없음, (d) enterprise tier 미지원 — 4 가지 trade-off 를 product 가 명시적으로 수용해야 plan 진입 가능.
- [ ] PARTIALLY FEASIBLE
- [ ] NOT FEASIBLE

**Justification**: section 2 의 capability matrix 에서 11/13 capability 가 기존 SOTA + agocraft 로 흡수됨. 남은 2/13 (실시간 협업, 모바일 편집) 는 trade-off 수용 시 M3+ 별도 WI 로 처리 가능. section 3 의 intrinsic limit 중 hardware ceiling 만 ≤ 200 Item 제약으로 박제됨 — production scale 진입 시 PRODUCTION_BACKLOG 우선순위 4 의 rendering-perf 3 차 council 의무. section 4 의 trade-off 7 개 중 가장 큰 cost-mover 는 real-time ↔ batched — 첫 MVP 는 batched 로 starts 함이 product 결정.

## 7. Accepted trade-offs (Product sign-off)

| Trade-off | Accepted by | Date |
|---|---|---|
| M0–M2 협업은 last-write-wins + lock (실시간 multi-cursor 아님) | hbpark (Discovery owner) | 2026-05-22 |
| 모바일 편집 미지원 (view-only) | hbpark | 2026-05-22 |
| AI 자동화 첫 MVP 미포함 | hbpark | 2026-05-22 |
| Enterprise tier (50+ seats / SSO / SLA) 미지원 — M5+ 별도 WI | hbpark | 2026-05-22 |
| Doc ≤ 200 Item, ≤ 50 페이지 / 캔버스 영역 (production scale > 시 별도 rendering-perf council) | hbpark | 2026-05-22 |

## 8. Pair sign-offs (specialist agents)

| Domain | Specialist | Sign-off | Notes |
|---|---|---|---|
| AI / model | `ai-safety-agent` | N/A (initial MVP 는 AI 미포함). 추후 WI 발행 시 의무 | — |
| Web Platform / runtime | `standards-runtime-platform-intelligence-agent` | **pending (M0 의무)** | Baseline reachability 의 4 도메인 모두 OK. drawElement origin trial 은 deferred |
| Cloud / scale / cost | `infrastructure-cost-optimization-agent` | **pending (DR-003 backend 결정 의 동반 사인)** | unit cost SMB tier 시 < $0.10 / DAU 목표 |
| Real-time / SLO | `sre-reliability-agent` | **pending (M2 의무)** | p99 doc-load < 5s 의 monitoring 셋업 |
| Privacy / data | `privacy-data-protection-agent` | **pending (M2 의무)** | per-tenant 격리 + GDPR/CCPA/PIPA 한국 |
| Library / supply chain | `library-adoption-supply-chain-governance-agent` | **pending (DR-002 auth + DR-003 backend)** | Clerk / Supabase / Convex 등 의 license + vendor lock |
| Frontend performance | `frontend-performance-agent` / `rendering-performance-architecture-agent` | **pending (M1 의무, M3 의무)** | INP < 200ms 50%, 200 Item ceiling 의 측정 |

## 9. Downstream gates

- [x] Risk & Governance Review may start.
- [x] Engineering Plan may start (FEASIBLE WITH TRADE-OFFS, 5 trade-off 모두 sign-off 박제).
- [ ] Discovery must re-scope — 해당 없음.

## Links

- Triggering Work Item: WI-001
- Discovery output: `features/foundation/PRODUCT_DISCOVERY.md`
- Related Decision Records: DR-001 (monorepo, planned), DR-002 (auth, planned), DR-003 (backend, planned)
- Related Risk reviews: `features/foundation/RISK_NOTES.md` (planned)
- Related Engineering Plan: `features/foundation/ENGINEERING_PLAN.md` (planned)
- agocraft (sister service project, multi-domain editing library) — cross-project boundary 의해 file 직접 참조하지 않음. 의존 결정은 DR-001 (planned). 산출물 정보 흐름 필요 시 weave 의 `records/decision-handoffs/` 또는 agocraft 의 `records/decision-handoffs/` 인박스 사용.
