# Work Item — WI-003

## Metadata

| Field | Value |
|---|---|
| ID | WI-003 |
| Title | First prototype slice — 4-domain embedded doc (mock) on a single page |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 (M1 의 첫 시연 — H1 가설 의 시각 evidence) |
| Created | 2026-05-22 |
| Target date | 2026-06-26 (M1 안에 완성) |
| Closed | — |

## Summary

agocraft publish 완료 전에 mock 으로 첫 prototype 시연. 사용자가 한 doc 안에 4 도메인 (slide / canvas-design / block-doc / media) 을 자유 임베드 + 저장/로드 (localStorage). USP "통합" 의 시각적 첫 증거. **agocraft 의 Composite tree 패턴 (Item/Unit) 을 mirror 하여, 향후 `@agocraft/core` publish 시 swap 자연.**

## Scope

### In scope

1. **WI-003 + DR-design-001** 동시 발행 (Design System Triage 첫 적용).
2. **react-router-dom v6** 도입 — LandingPage (`/`) + DemoDocPage (`/doc/demo`) split.
3. **`apps/web/src/document/` mock model** — Document / Item / Unit 추상. agocraft 의 Composite tree mirror.
4. **4 도메인 mock 렌더러** — `SlideBlock`, `CanvasBlock`, `DocBlock`, `MediaBlock`. 각자 도메인 accent token 사용. 단순 placeholder 콘텐츠.
5. **"Add domain" UI** — 4 도메인 중 하나 선택 → doc 의 끝에 새 block 추가.
6. **localStorage 저장/로드** — single doc fixed ID (`demo`). 새로고침 후 유지.
7. **Aurora theme + 3 theme switch 동작 검증** — demo page 에서도 동일.
8. **Continuous Self-Verification** — dev server, curl 검증.

### Out of scope (별도 WI)

- 멀티 doc (doc list, create/delete). M2.
- nested embed (slide 안에 block-doc 등). M3+.
- drag-drop reorder. M2.
- editor (텍스트 입력 / shape 추가) — 첫 mock 은 read 위주, "Add domain" 으로만 변경. M2 의 진짜 editing.
- 인증 / workspace / 권한 — DR-002~005 결정 후. M2.
- agocraft 의 실 의존 — HANDOFF-001 응답 후. WI 갱신.
- a11y full audit + axe-core 통합 — WI-002 의 잔여 acceptance.

## Acceptance criteria

- [ ] `records/work-items/WI-003-first-prototype-slice.md` (이 파일) Status=Done.
- [ ] `records/design-reviews/DR-design-001-domain-accent-tokens.md` Status=Accepted.
- [ ] `packages/design-system/src/tokens.css` 의 3 theme variant 모두 `--domain-{slide,canvas,block,media}-accent` 4 token 정의.
- [ ] `apps/web/package.json` 에 `react-router-dom@^6` 추가.
- [ ] `apps/web/src/document/{document.ts, types.ts, storage.ts, domains/}` 구성.
- [ ] 4 mock renderer (`SlideBlock`, `CanvasBlock`, `DocBlock`, `MediaBlock`) — 각 도메인 accent + 도메인 라벨 표시.
- [ ] `apps/web/src/pages/{LandingPage, DemoDocPage}.tsx`.
- [ ] localStorage round-trip — doc 변경 → reload → 변경 유지.
- [ ] `pnpm lint && pnpm typecheck && pnpm --filter @weave/web build` PASS.
- [ ] Dev server (5174) `/` + `/doc/demo` 둘 다 HTTP 200, 시각 검증.

## Context

- ENGINEERING_PLAN M1 (~2026-06-26) 의 의무. 단 M0 의 design system 완성 후 즉시 진입 → 일정 단축 가능.
- 사용자 선택 (2026-05-22): 다음 작업으로 **첫 prototype** 우선. **Design System Triage** 의 첫 시연 동행.
- USP 검증 — 4 도메인 통합의 시각 evidence 가 사용자 인터뷰 (M0 의무, R-1 P1 risk) 의 talking point.

## Technical Feasibility verdict

- FR-001 안에 포함. 추가 review 없음. mock 단계라 4 도메인의 실제 editing 깊이는 추후 — out of scope.

## Escalation triggers

- [ ] User data — localStorage 만 (offline). 의무 없음. M2 의 multi-tenant 진입 시 의무.
- [ ] Payment — N/A.
- [ ] AI — N/A.
- [x] **UI / UX change** — `frontend-performance-agent` baseline 사인 (M1 의무).
- [x] **Design System Triage** — 새 token 4 개 추가 → `design-system-agent` review (DR-design-001).
- [ ] Public page — `/doc/demo` 가 향후 public 진입 가능 (preview). M4 의 SEO 시점에 결정.
- [x] **Library / dependency** — react-router-dom 추가 → `library-adoption-supply-chain-governance-agent` 사인.

## Links

- Related Decision Records: DR-007 (design system tooling, Accepted)
- Related Design Reviews: DR-design-001 (4 domain accent tokens, planned)
- Related Risk reviews: `features/foundation/RISK_NOTES.md` (R-2 agocraft mock 으로 우회, R-17/18 design system)
- Related WI: WI-001 (service kickoff), WI-002 (design system foundation, In Progress)
- Related Engineering Plan: `features/foundation/ENGINEERING_PLAN.md` § M1

## Status updates

- 2026-05-22: WI-003 발행. Design System Triage 의 첫 적용 — DR-design-001 (4 도메인 accent tokens, Accepted) 동시 발행. M0 의 design system 완성 후 즉시 M1 진입.
- 2026-05-22: 1차 prototype 완성 — react-router-dom v7 도입, LandingPage + DemoDocPage split, document model (`apps/web/src/document/` Item/Unit mirror), 4 도메인 mock 렌더러 (SlideBlock/CanvasBlock/DocBlock/MediaBlock), Add-block UI, localStorage 저장/로드 round-trip 동작. Button 의 asChild prop 부활 (CardEyebrow/CardTitle 의 children type 도 ReactNode 로 확장 — Design System Triage 의 🔧 Extended 사례). lint+typecheck+build PASS. dev server 5174 / + /doc/demo HTTP 200.
