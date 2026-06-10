# WI-168 — Flavor-fit 에이전트 커맨드 표면 (AgentSurfacePolicy)

- Status: DESIGN — DR-115 DRAFT, 사용자 리뷰 대기 (2026-06-11)
- Origin: 사용자 지시 — "프레젠테이션에서 지원하지 않는 동작이 가능해질
  여지를 남기지 말 것. 슬라이드 페이지 vs frame 관리 차이를 에이전트에게
  가르치는 노력도 하지 말 것. 내부 커맨드는 동일, 에이전트 노출 유틸은
  디자인 모드별로 랩핑 + DI 주입(이전 작업 패턴). 핫키맵도 마찬가지."
- Related: DR-115(설계), DR-114(EditorModeContext), WI-167(직접 동기 —
  가드 모델의 재발 클래스), DR-064(부분 개정 대상), WI-153 P4 / DR-111 D5

## Scope

1. `EditorModeContext.agent: AgentSurfacePolicy` (G1: 4 flavor 합성 +
   소비처 전환 same-change).
2. 에이전트 브릿지 주입: 정책 기반 façade(CommandRegistry 뷰 + 어댑터
   editor 프록시) + `retargetCommandSchemas({only, rename, patch})`.
3. page-bounded 표면: `weave.page.add` 랩핑 신설, item/chart add의
   containerId 의미 재정의(mapInput), 프롬프트 pageLine → promptFragment.
4. Decommission Sweep: `agent-page-target.ts`(retarget 가드) + 하드코딩
   pageLine — 어댑터 흡수와 동시 제거. min-size/container/text-box 가드는
   유지(모드-정책 아님).
5. 핫키맵: 별도 정책 보류(DR-115 §3 — 현존 분기 V/H는 camera.dragPan으로
   기해소, 분기 0건 정책은 죽은 config). 규칙만 기록.

## 비-Scope

- 내부 커맨드 레지스트리 분기(기각 — DR-115 §4).
- 서버(small-think) 쪽 변경 — 노출은 전부 클라이언트 façade에서 끝난다.

## Phases (예정 — DR 승인 후 ENGINEERING_PLAN 확정)

- P1: types + pieces/agent-surface.ts + 4 flavor 합성 + façade + 주입 배선
  (mixed/canvas-board pass-through 무회귀 고정).
- P2: page-bounded 표면 본체(page.add, mapInput, 스키마 오버레이,
  promptFragment) + WI-153 P4/WI-167 가드 디커미션 + 테스트.
- P3: 스윕 + e2e 무회귀 + 기록 클로즈.

## 진행 메모

- 2026-06-11: 표면 조사 완료 — 브릿지 `commands`는 주입 인터페이스(façade
  가능), `retargetCommandSchemas` 벤더 1급 지원(누락 키 loud-fail) 확인.
  핫키 분기 현황 조사: V/H만 flavor-분기이며 이미 정책 게이트(use-hand-tool
  `enabled` ← camera.dragPan). DR-115 DRAFT 작성.
