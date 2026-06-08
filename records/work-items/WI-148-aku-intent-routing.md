# WI-148 — 아쿠 의도 기반 파이프라인 라우팅 (Aku intent-routed pipeline)

- 상태: **Phase 1 + 2(api·byo-apikey·byo-ssh) + 2b(와이어) + 2d(LLM 분류) + 서버 이벤트 칩 반영 완료.** 남음: byo-ssh LLM 분류·라이브 e2e(server-dependent). 상세 small-think WI-033.

## 서버 이벤트 → 칩 반영 (2026-06-08)

`server` 모드 의미론 정정: 자동 턴은 weave가 와이어 intent를 **보내지 않아**(명시 슬래시/칩만 전송) 서버가
독립 분류(키워드/LLM)하고, 서버의 `intent` 이벤트로 칩을 그 operation에 갱신한다(서버=적용 진실원).
weave 로컬 분류는 task 지시문 + 초기 칩에 계속 사용. 이로써 server 모드에서 서버 LLM 분류가 실제로 쓰인다
(전엔 weave 키워드가 explicit로 전송돼 서버 LLM을 선점). `use-aku-agent.ts` onEvent `intent` 핸들러 +
wireIntent를 explicit-pick-only로. typecheck·lint·단위 144·build·e2e 3 green.
- 관련: DR-102, FR-023, RISK-012, features/aku/ENGINEERING_PLAN.md (WI-148 절), HANDOFF-027 → small-think
- 영향 범위: **교차 프로젝트** — weave(클라이언트 UX·컨텍스트) + small-think(서버 하니스 의도 단계)

## 문제 (사용자 요청)

아쿠는 현재 사용자 입력을 **단일 task 프롬프트**로 조립해 한 번 submit하고, 서버 에이전트가
추가/수정/삭제/교체를 모두 같은 경로로 처리한다(`apps/web/src/features/aku/agent/use-aku-agent.ts`
→ `runTurn`). 의도 구분이 없어 편집 상황에서 다음이 구별되지 않는다:

1. 새 슬라이드/아이템 **추가**
2. 기존(지칭) 아이템 **수정·삭제**
3. **선택된** 아이템 수정
4. **지칭** 아이템의 공간을 다른 것으로 **교체**
5. **선택** 아이템의 공간을 다른 것으로 **교체**
6. **색상 팔레트** 변경
7. 기존 디자인 **톤 유지** 슬라이드 추가
8. 기존 디자인 **무시** 슬라이드 추가
9. 선택 슬라이드를 기존 디자인 **톤에 맞춰** 변경

## 목표

사용자 의도를 파악해 이후 파이프라인(주입 컨텍스트 · 지시문 · 스타일/톤 정책 · 리뷰 pass 구성)을
**의도별로 다르게** 라우팅한다. 결과는 **하이브리드(자동 추론 + 보정칩)**로 노출해 오분류를 즉시
교정할 수 있게 한다.

**분류 위치는 클라이언트 설정(`intentSource`)으로 선택**한다 — `server` / `client` / `off`:

- `server` (기본): 서버 하니스가 의도 단계에서 분류 + 라우팅. 자동 추론 + 보정칩.
- `client`: 클라이언트가 의도를 결정(명시 선택 또는 클라이언트 휴리스틱)하고 **서버의 분류 턴(하니스 의도 단계)을 생략**. 클라이언트가 지시문·톤 컨텍스트를 task에 직접 조립하고, 명시 intent 라벨을 함께 보내 서버가 pass 오버라이드만 적용. 서버가 의도를 모르는 빌드(구버전)에도 task 증강만으로 동작 → graceful degradation.
- `off`: 의도 라우팅 비활성 — 현재 단일 경로 그대로.

라우팅 플랜의 **적용(지시문·톤 컨텍스트)**은 모드에 따라 클라이언트/서버 어느 쪽에서든 일어날 수
있으나, **리뷰 pass 오버라이드는 항상 서버**(하니스가 서버 소유)다. `client` 모드에서 "서버 하니스
생략"은 *분류 모델 턴*을 생략한다는 의미이며, 라벨 기반 pass 튜닝은 서버가 받아서 적용한다.

## 핵심 설계 결정 (요약 — 상세는 DR-102)

- 9개 평면 의도가 아니라 **직교 3축**으로 분해: `Operation × Target (+ Tone policy)`.
  - Operation(동사, 레지스트리 키): create / add / edit / delete / replace / recolor / retone
  - Target(범위 리졸버): none / selected / referenced / deck
  - Tone policy(수식자): inherit / ignore / match
- 서버: `withItemElicitation`를 본뜬 **`withIntentRouting` TaskRunner 데코레이터** + Operation→Plan **레지스트리(record, switch 금지)**.
- 와이어: **additive `intent` AgentEvent** + reverse 확인 채널(clarify 패턴 재사용) → 보정칩.
- weave: 컨텍스트용 **`design.tone` 컨텍스트 툴**(해석된 테마 토큰/뷰모델 — 스냅샷에 없는 정보), 의도 보정칩 UI, 슬래시 명시 의도, 설정 토글.

## 진행 단계 (워크플로)

Discovery(완료, 본 WI) → **Technical Feasibility(FR-023)** → Risk(RISK-012) → **Engineering Plan(features/aku/ENGINEERING_PLAN.md)** → (구현 보류). 본 작업은 설계/계획까지만.

## 산출물 (이번 사이클)

- [x] WI-148 (본 문서)
- [x] FR-023 — Technical Feasibility Review
- [x] DR-102 — 아키텍처 결정 기록
- [x] RISK-012 — 리스크 리뷰
- [x] features/aku/ENGINEERING_PLAN.md — WI-148 엔지니어링 플랜 절 (주 산출물)
- [x] features/aku/DECISION_LOG.md D21 / RISK_NOTES.md R7
- [x] HANDOFF-027 → small-think/records/decision-handoffs (서버 의도 단계)
