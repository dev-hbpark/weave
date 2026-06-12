# WI-207 — free-placement 에이전트 표면에도 비정규 19개 de-list 적용

- **Status:** DONE (2026-06-13) · **DR:** DR-132 · **Relates:** WI-205/DR-130,
  WI-206/DR-131, small-think DR-067/HANDOFF-029
- **Origin:** 운영자 요청 "아쿠에이전트 편집의 입력 토큰이 너무 많이 쓰이는데
  이거 더 줄이고싶어" — 텔레메트리 확인 결과 실사용 세션 전부 free-placement
  (`tools: 52/53`)라 WI-205의 page-한정 trim이 실사용에 미적용이었음.

## Change

- `document/editor-mode/pieces/agent-surface.ts` — WI-205의 19개 de-list를
  `NONCANONICAL_AGENT_TOOLS`(사유 주석 포함, 단일 소스)로 추출;
  `FREE_AGENT_SURFACE.tools = { allExcept: NONCANONICAL_AGENT_TOOLS }`.
- `document/editor-mode/types.ts` — `AgentSurfacePolicy.tools`에
  `{ allExcept }` 변형 추가 (pass-through MINUS 닫힌 de-list; free의
  신규-커맨드 자동 노출 철학 유지).
- `features/aku/agent/agent-surface.ts` — bindAgentSurface에 allExcept 분기:
  lazy 라이브-레지스트리 필터 뷰 + 스키마 필터 + de-list 이름 exec
  fail-closed(`agent-tool-not-exposed`).
- coverage test — PAGE_EXCLUDED가 NONCANONICAL spread + page-특정 5개로 단순화,
  FREE 기대를 `{ allExcept }`로 갱신, de-list ⊆ REGISTERED 드리프트 가드 추가.

## 효과 (임시 프로브 실측)

free 광고 50 → 31 도구, 스키마 ~17,488 → ~14,656 tok 추정(−16%).
WI-206 dedup(base 카탈로그)과 합산 적용.

## SVL

- agent-surface façade 15 green(allExcept pass-through/fail-closed/lazy 신규
  커맨드 auto-flow 2건 추가), pieces 31 green, coverage 8 green.
- features/aku + editor-mode 전체: 345 green — 실패 4건은 동시 세션의
  in-flight agent-mode(AkuApiKeys) 작업분으로 본 변경 무관(미커밋 working tree).
- `tsc --noEmit`: 본 변경 파일 전부 클린(잔여 에러는 동시 세션 파일 한정).
- biome check 6 파일 클린.

## 운영 후속

- 라이브 효과는 HANDOFF-029 재측정에 합산(배포 + 신규 태스크 필요).
- 품질 회귀 신호 시 롤백 = `FREE_AGENT_SURFACE`를 `tools:"all"`로 1줄 복원.
