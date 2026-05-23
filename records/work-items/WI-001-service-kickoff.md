# Work Item — WI-001

## Metadata

| Field | Value |
|---|---|
| ID | WI-001 |
| Title | weave service kickoff — horizontal multi-domain workspace for B2B teams |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 |
| Created | 2026-05-22 |
| Target date | 2026-08-31 (M0–M2 horizontal canvas MVP) |
| Closed | — |

## Summary

업무 팀이 한 문서 안에서 슬라이드 · 자유 캔버스 · 블록 문서 · 미디어 를 **장보기 없이** 혼합 편집 · 공유 · 협업할 수 있는 B2B SaaS 도구. 기존 도구는 Notion (문서) / Figma (캔버스) / Miro (whiteboard) / PPT (슬라이드) 로 분리되어 있어 한 캠페인 / 한 제안서 / 한 기획 안에서도 도구 간 컨텍스트 스위칭 발생. weave 는 이 분리 자체를 USP 로 잡는 첫 horizontal workspace.

## Scope

### In scope (이 WI 의 outcome)

1. **새 service project workspace** `workspace/weave/` 의 scaffold + Discovery / Feasibility / Risk / Engineering Plan 의 첫 라운드.
2. **agocraft (library) ↔ weave (service) 의 monorepo relation 결정** (DR-001 of weave).
3. **horizontal canvas MVP (M0–M2)** 의 minimum viable feature set 확정:
   - 한 doc 안에 4 도메인 (slide / canvas / block-doc / media) 임베드 자유 조합
   - 회원가입 + 워크스페이스 + 멤버 초대
   - 문서 저장 / 공유 / 협업 기본
4. **Freemium per-seat 사업 모델 가설의 가격 / 한도 첫 안** (M4 이전 결정 가능).
5. **교육·쇼케이스 우선 GTM** 의 콘텐츠 backlog 첫 윤곽 (template / blog / docs).

### Out of scope (이 WI 가 아님 — 별도 WI 발행)

- 실시간 multi-cursor 협업 (M3+ 별도 WI, FR-002 의무)
- 데이터 연동 (CRM / sheets) 임베드 (M5+ 별도 WI)
- AI 자동화 (prompt → 초안 생성) (별도 WI, ai-safety-agent 사인 의무)
- 모바일 네이티브 앱 (initial release 는 웹만)
- 결제 / billing (Freemium 단계까지는 미수익 운영)

### 명시적 deferred (production backlog 참조)

- agocraft 의 `PRODUCTION_BACKLOG.md` 우선순위 0 (storage upload / blob URL revoke / magic-byte / hls.js / IntersectionObserver auto-pause / playwright pixel baseline) — weave 가 첫 production release 시 모두 처리 의무.

## Acceptance criteria

- [ ] `workspace/weave/CLAUDE.md` Purpose 가 service 특화로 update.
- [ ] `records/work-items/WI-001-service-kickoff.md` (이 파일) Status=Done.
- [ ] `records/feasibility-reviews/FR-001-horizontal-multidomain-workspace.md` Verdict 명시 (FEASIBLE / FEASIBLE WITH TRADE-OFFS / PARTIALLY / NOT).
- [ ] `features/foundation/PRODUCT_DISCOVERY.md` 4 결정 박제 + JTBD + 기존 도구 매핑.
- [ ] `features/foundation/RISK_NOTES.md` first risk list (R-1 ~ R-N).
- [ ] `features/foundation/ENGINEERING_PLAN.md` M0–M4 90-day plan + monorepo 결정 (DR-001).
- [ ] `records/decisions/DR-001-agocraft-weave-monorepo.md` 의 verdict.
- [ ] OS-root `tools/validate_workspace.py` PASS.

## Context

- **agocraft** (sister service project, multi-domain editing engine library) PoC 완료 — 12 packages, 454 unit + 20 e2e GREEN, 6 도메인 (canvas-design / presentation / block-doc / media / sticky / measurement) 통합 모델 + Capability 디스패치 + StyleCascade. 단 library 자체로는 가치 전달 불가 — 위에서 동작할 service 가 weave. **agocraft 의 file 을 직접 참조하지 않음** (cross-project boundary). 의존 형식 (npm package vs file: vs root pnpm) 결정은 DR-001.
- Discovery 의 4 결정 (2026-05-22 turn): horizontal multi-domain workspace × B2B SaaS × USP=통합 × MVP horizontal + 교육 우선 × Freemium per-seat. 이전 conversation 의 AskUserQuestion 답변에 박제.
- 시장 위치 가설: Notion (doc) + Figma (캔버스) + Miro (whiteboard) 의 교차점. 빈 자리 가설. Coda / Tana / Whimsical 가 인접하나 어느 쪽도 4 도메인 production-grade 통합은 안 함.

## Escalation triggers (check before starting)

- [x] User data → 회원가입 / 워크스페이스 / 문서 데이터 → `privacy-data-protection-agent` 사인 의무 (M2 이전).
- [ ] Payment / billing → Freemium 단계는 아님. PRO tier 도입 시 별도 WI.
- [ ] AI feature → 첫 MVP 는 아님. 별도 WI 시.
- [x] UI / UX change → `frontend-performance-agent` / `rendering-performance-architecture-agent` 사인 의무.
- [x] Public page → 교육·쇼케이스 우선 = 공개 페이지 SEO/AI visibility 의무. `seo-ai-visibility-agent` 사인.
- [x] Library / dependency → agocraft 의존. `library-adoption-supply-chain-governance-agent` 사인.
- [ ] Release → 첫 launch 시 별도 LAUNCH_GATE.

## Technical Feasibility verdict

- FR record: `records/feasibility-reviews/FR-001-horizontal-multidomain-workspace.md`
- Verdict: **FEASIBLE WITH TRADE-OFFS** (요약 — 4 도메인 통합 자체는 agocraft 가 흡수, collab/sync 와 multi-tenant 인프라가 트레이드오프 영역)
- Accepted trade-offs (Discovery owner 사인 후 박제):
  - 첫 MVP 는 실시간 multi-cursor 아닌 last-write-wins + lock 으로 시작.
  - 모바일 편집은 view-only, 편집은 데스크탑 우선.
  - 오프라인 편집은 M5+ 별도 WI.

## Links

- Related Decision Records (DR-*): DR-001 (planned: agocraft↔weave monorepo)
- Related Risk reviews (RISK-*): `features/foundation/RISK_NOTES.md` (planned)
- Related Feasibility Reviews (FR-*): FR-001
- Related Handoffs (HANDOFF-*): —
- Related Incidents (INC-*): —
- Related Engineering Plan: `features/foundation/ENGINEERING_PLAN.md` (planned)
- Related Launch Gate (LG-*): — (첫 production release 시)

## Status updates

- 2026-05-22: WI-001 발행. Discovery 4 결정 박제. FR-001 (FEASIBLE WITH TRADE-OFFS, 5 trade-off sign-off) / Discovery / Risk (16 risks) / Plan (M0-M4 90-day) 의 첫 라운드 동시 작성.
- 2026-05-22: DR-001 Accepted (Option E — private npm publish + yalc). agocraft 의 `records/decision-handoffs/HANDOFF-001-publish-as-npm.md` 인박스로 publish 요청 발행. SLA 2 영업일.
