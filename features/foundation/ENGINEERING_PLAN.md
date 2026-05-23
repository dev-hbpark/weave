# ENGINEERING_PLAN — weave foundation (M0–M4)

> OS workflow step 5. WI-001 / FR-001 / DR-001 (proposed) / RISK_NOTES 박제 기반. 90-day plan. Date: 2026-05-22.

## Plan-level decisions (precondition)

- **Tech stack baseline**: Frontend 는 agocraft 와 동일 (React 18 + Vite + TypeScript strict + pnpm + Biome).
- **Backend**: DR-003 결정 의무 (M0 안에). 첫 가설: **Node + Hono + Drizzle + Postgres (Neon serverless)**.
- **Auth**: DR-002 결정 의무 (M0 안에). 첫 가설: **Clerk** (vs Supabase Auth vs WorkOS vs Lucia).
- **Storage**: DR-005 결정 의무 (M1 안에). 첫 가설: **S3-compatible (R2 Cloudflare or AWS S3)**.
- **Hosting**: Vercel (Next.js / Astro frontend) + Fly.io / Railway (Hono backend) + Neon (Postgres). M5+ 에 production-grade 검토.

## Milestones

### M0 — Foundation week (2026-05-22 → 2026-06-05, 2 weeks)

**Goal**: 새 프로젝트의 모든 결정 점 (DR-001~005) verdict + 첫 사용자 인터뷰 + agocraft handoff.

- [ ] **DR-001 verdict** — user confirm (이 plan 의 동행 doc). 첫 dev cycle 측정 (agocraft 변경 → weave 반영).
- [ ] **agocraft 측 HANDOFF 발행** — weave 의 own `records/decision-handoffs/` 에서 작성, agocraft 의 `records/decision-handoffs/HANDOFF-001-publish-as-npm.md` 인박스로 전달. publish workflow 의무.
- [ ] **DR-002 (auth)** — library-adoption-supply-chain-governance-agent 사인. verdict.
- [ ] **DR-003 (backend)** — infrastructure-cost-optimization-agent 사인. verdict.
- [ ] **DR-004 (multi-tenant)** — per-tenant schema vs RLS. privacy-data-protection-agent 사인.
- [ ] **DR-005 (storage)** — S3 / R2 / Supabase. verdict.
- [ ] **사용자 인터뷰 ≥ 10 건** — H1/H2 검증 (Discovery § 5). SMB 마케팅·영업·기획 팀 리더 대상.
- [ ] **weave 의 첫 package skeleton** — `apps/web/` (Vite + React), `packages/api/` (Hono server), `packages/db/` (Drizzle schema). agocraft 의존은 placeholder (publish 후 진짜 연결).
- [ ] **standards-runtime-platform-intelligence-agent** baseline 사인 — 4 도메인 의 Browser Baseline reachability.
- [ ] **README + docs/engineering/AGOCRAFT_DEPENDENCY.md** — 의존 어떻게 셋업 (yalc / npm link / private registry).

**M0 Acceptance**: DR-001~005 모두 verdict. 사용자 인터뷰 ≥ 10. weave 의 npm dev server `pnpm dev` 동작 (agocraft 의 placeholder 컴포넌트라도 화면 렌더).

### M1 — First prototype (2026-06-05 → 2026-06-26, 3 weeks)

**Goal**: 한 doc 안에 4 도메인 (slide / canvas-design / block-doc / media) 임베드 + 저장/로드 (localStorage). Single-user only.

- [ ] **agocraft publish 완료** (HANDOFF 의 응답) — `@agocraft/core`, `@agocraft/domain-canvas`, `@agocraft/domain-presentation`, `@agocraft/domain-block-doc`, `@agocraft/domain-media`, `@agocraft/renderer-html`. weave 가 prerelease 의존.
- [ ] **weave 의 Document model** — agocraft 의 Composite tree 위에 weave 자체의 Doc/Page/Section 추상. 4 도메인 임베드 자유.
- [ ] **첫 화면**: 빈 doc + "+" 으로 4 도메인 임베드 가능. 각 도메인의 PoC 컴포넌트 렌더.
- [ ] **localStorage 저장/로드** — 새로고침 후 doc 유지.
- [ ] **e2e 1 시나리오** — Playwright 로 빈 doc → 4 도메인 임베드 → 저장 → reload → 유지 검증.
- [ ] **frontend-performance-agent** 의 첫 사인 — INP < 200ms 50% on M1 doc size (≤ 50 Item).
- [ ] **agocraft PRODUCTION_BACKLOG 우선순위 0 의 6 항목** 중 weave M0-M1 안에 처리해야 할 항목 (storage upload skeleton, blob URL revoke, magic-byte) handoff 응답 확인 + weave 측 통합.

**M1 Acceptance**: 한 doc 에 4 도메인 임베드 + localStorage 저장/로드 동작. INP < 200ms 50%.

### M2 — Multi-tenant + sharing (2026-06-26 → 2026-07-24, 4 weeks)

**Goal**: 회원가입 + workspace + 멤버 + doc 의 multi-tenant 저장 (Postgres) + 공유 link + 기본 동시 편집 (last-write-wins + lock).

- [ ] **Auth wire** (DR-002 결과) — 회원가입 / 로그인 / SSO (Google, Microsoft).
- [ ] **Workspace + member model** — org → workspace → member → role (owner/editor/viewer).
- [ ] **Doc 저장** Postgres (DR-004 결과) + S3/R2 (DR-005 결과). 이미지/비디오 upload + magic-byte 검증 + presigned URL.
- [ ] **공유 link** — view-only / edit / commenter (간단 ACL).
- [ ] **Last-write-wins + lock** — 한 명이 편집 중이면 다른 멤버는 view-only. 5 초 idle 시 lock 자동 release.
- [ ] **privacy-data-protection-agent** 사인 — per-tenant 격리 검증, GDPR/CCPA/PIPA 한국 점검.
- [ ] **sre-reliability-agent** 사인 — p99 doc-load < 5s monitoring 셋업, 첫 SLO 박제.
- [ ] **Closed beta 시작** — n=20 명. M0 인터뷰 진행자 중 일부 + 신규 5 명.

**M2 Acceptance**: 회원가입 → workspace 생성 → 멤버 초대 → doc 만들고 공유 → 다른 멤버 보고 편집 (last-write-wins) 의 e2e 시나리오 통과. 한국 / 미국 region 격리. closed beta 20 명 onboarded.

### M3 — Beta retention measurement + critical bugs (2026-07-24 → 2026-08-14, 3 weeks)

**Goal**: closed beta 의 retention 측정 + 4 도메인 활용 비율 측정 + critical bug fix + first NPS.

- [ ] **Retention 측정** — D1/D7/D30 retention. 목표: D7 ≥ 25%, D30 ≥ 15%.
- [ ] **4 도메인 활용 doc 비율** — 한 doc 안에 ≥ 2 도메인 / ≥ 3 도메인 / ≥ 4 도메인 사용한 doc 비율 측정. ≥ 3 도메인 ≥ 30% 가 USP 의 evidence.
- [ ] **NPS** — beta 사용자 대상 single-question survey. 목표 ≥ 30.
- [ ] **Top-10 critical bug** fix.
- [ ] **rendering-performance-architecture-agent** 2 차 council — 실제 beta data 의 INP / paint / memory 측정. 200 Item ceiling 확인.
- [ ] **User feedback 인터뷰 ≥ 10** — H1 의 retention 안 나오면 USP 가설 재검토.

**M3 Acceptance**: D7 retention 측정 (목표 25%), NPS 측정 (목표 30), 4 도메인 활용 비율 측정 (목표 ≥ 3 도메인 30%), critical bug 모두 해결.

### M4 — Open beta + template / showcase / blog (2026-08-14 → 2026-08-31, 2.5 weeks)

**Goal**: open beta + 첫 template gallery (10 개) + blog (5 편) + waitlist + 가격 인터뷰.

- [ ] **Template gallery 10 개** — 4 도메인 활용 sample (캠페인 hub / 영업 제안 / 제품 RFC / 디자인 시스템 / 마케팅 보고서 / 컨퍼런스 슬라이드 / OKR 추적 / 사용자 인터뷰 노트 / 컨퍼런스 메모 / brand asset 라이브러리).
- [ ] **Blog 5 편** — "왜 4 도메인 통합인가" / "Notion/Figma 의 한계" / "B2B 팀의 컨텍스트 스위칭 비용" / "weave 의 첫 use case 5 개" / "open beta 시작 안내".
- [ ] **공개 landing + waitlist** — Astro/Next.js SSG. structured data + AI-friendly schema. seo-ai-visibility-agent 사인.
- [ ] **가격 인터뷰 n=5** — Notion ($10) / Figma ($15) anchor. weave PRO 의 willingness-to-pay 측정.
- [ ] **Open beta 공지** — 기존 closed beta 20 명 + waitlist conversion.

**M4 Acceptance**: open beta 공개. template 10 / blog 5 / landing 의 SEO 사인. 가격 인터뷰 완료.

## Cross-cutting (모든 milestone 통과 의무)

- **Continuous Self-Verification (OS step 7)** — agocraft 패턴 동일. apps/web/e2e/ 의 모든 변경마다 통과 의무.
- **CI 통합** — playwright + size-diff + unit + lint + validate_workspace.py 의 PR check.
- **agocraft handoff 동기화** — sister project 와의 모든 communication 은 `records/decision-handoffs/` 경유. PRODUCTION_BACKLOG 우선순위 0 의 항목별 status.
- **DECISION_LOG** — 매 milestone 의 marker, 모든 DR verdict.
- **RISK 갱신** — milestone 마다 R-1 ~ R-16 의 status update. 새 risk 발견 시 R-N 추가.

## Deferred (production backlog 후보)

- 실시간 multi-cursor (Yjs / Liveblocks) — M5+ 별도 WI.
- AI 자동화 (prompt → 초안) — M5+ 별도 WI. ai-safety-agent 사인.
- 모바일 native / PWA 편집 — M5+ 별도 WI.
- PPT import/export — M5+ 별도 WI.
- 데이터 연동 (CRM / sheets) live embed — M5+ 별도 WI.
- Enterprise tier (50+ seats / SSO / SLA / VPC) — 첫 결과 후.
- Production launch — M5+ 의 LAUNCH_GATE-001.

## Links

- WI-001
- FR-001
- DR-001 (this plan 동행)
- DR-002, DR-003, DR-004, DR-005 (M0 verdict)
- `features/foundation/PRODUCT_DISCOVERY.md`
- `features/foundation/RISK_NOTES.md`
