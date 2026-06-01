# Work Item — WI-064

## Metadata

| Field | Value |
|---|---|
| ID | WI-064 |
| Title | e2e 영속화 테스트 환경 갭 — playwright 하에서 `api/designs/*` 백엔드 미서빙 |
| Owner | hbpark |
| Status | Open |
| Severity | P2 |
| Created | 2026-06-01 |
| Target date | 2026-06-15 |
| Closed | — |
| Source | [WEEKLY-REVIEW-2026-06-01](../../docs/command-center/WEEKLY-REVIEW-2026-06-01.md) §3·§7; 반복 언급: [AUDIT-005](../audits/AUDIT-005-2026-06-01-rule6-re-audit.md) §5, [AUDIT-007](../audits/AUDIT-007-2026-06-01-rule6-gate-drift-and-blindspots.md) §5 |

## Summary

2026-05-29 cloud-authoritative 영속화 모델 도입 이후, playwright e2e 의 `webServer: pnpm dev`(Vite)는 Vercel `api/designs/*` 라우트를 서빙하지 않는다. 그 결과 `saveDesign` 이 404 → 디자인 미영속 → **디자인 생성/시드에 의존하는 e2e ~29건이 로컬에서 연쇄 실패**한다. 렌더링/인터랙션 등 영속화 비의존 테스트(279건)는 green 이므로 제품 회귀는 아니나, **영속화를 건드리는 변경의 Continuous Self-Verification(워크플로우 step 7)을 막는 환경 갭**이다.

이 갭은 AUDIT-005·AUDIT-007 두 차례 "사전-존재 환경 사안, 본 작업과 무관"으로 우회됐다 — 두 번 우회된 항목은 별도 추적(weekly-review 품질 바)이 필요하므로 본 WI 로 발행한다.

## Problem (현상)

- `pnpm dev`(Vite dev server)는 `apps/web/api/*`(Vercel Functions)를 실행하지 않음.
- playwright `webServer` 가 이 Vite 만 띄움 → `POST /api/designs/*` 404.
- `saveDesign` 실패 → 디자인이 KV 에 영속되지 않음 → 후속 navigation/seed 의존 spec 실패.
- 재현: stash 로 커밋 HEAD 검증 시에도 동일 실패(new-design·marquee 등) — 코드가 아니라 환경 원인.

## Scope

### In scope
1. playwright 하에서 `api/designs/*` + KV 를 제공하는 백엔드 기동 경로 확보 — 후보:
   - (A) `webServer` 를 `vercel dev` 류로 교체(Functions + Vite 동시 서빙), 또는
   - (B) e2e 전용 `api` 핸들러 + in-memory/로컬 KV 목 + 정적 Vite, 또는
   - (C) MSW 등으로 `api/designs/*` 네트워크 목 + 인메모리 store.
2. 선택지 trade-off(충실도 vs CI 속도/복잡도)를 DR 로 기록 후 채택.
3. 영속화 의존 e2e ~29건 green 재현 + CI 게이트 편입.

### Out of scope
- 실제 프로덕션 인증/권한 모델(별도; `apps/web/CLAUDE.md` 보안 모델 참조).
- 영속화 비의존 e2e(이미 green).

## Acceptance
- [ ] playwright 풀런 green(영속화 의존 spec 포함) — 로컬 + CI.
- [ ] 선택 접근의 DR 기록.
- [ ] CI 가 영속화 e2e 를 게이트로 실행(회귀 시 fail).

## Notes
- 우선순위 P2: 제품 회귀는 아니나 SVL 커버리지 공백이라 영속화 기능 작업(저장/공유/멀티스텝 agent 편집) 착수 전 해소 권장.
