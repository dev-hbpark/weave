# WI-168 — Flavor-fit 에이전트 커맨드 표면 (AgentSurfacePolicy)

- Status: DONE — P1~P3 완료, 전 게이트 green (2026-06-11)
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
- 2026-06-11: 사용자 승인("구현진행해") → P1~P3 구현 완료.
  - **P1**: `types.ts`에 `AgentHostContext` / `AgentToolAdapter` /
    `AgentSurfacePolicy` + `EditorModeContext.agent`. 설계 대비 1개 정제:
    어댑터 `schema`는 리터럴이 아닌 **함수형 `(base) => AgentCommandSpec`**
    — pieces가 앱-레이어 카탈로그(WEAVE_COMMAND_SCHEMAS)를 import하지 않고
    오버레이만 기술 (모듈 경계 유지). `retargetCommandSchemas`는 미사용 —
    함수형 schema가 그 역할(rename/patch/loud-fail)을 흡수.
  - **P1 façade**: `features/aku/agent/agent-surface.ts` `bindAgentSurface`
    — "all"은 identity triple(무회귀 toBe-고정), allow-list는 읽기 전용
    CommandRegistry 뷰 + 스키마 오버레이 + exec 프록시(미노출 이름
    fail-closed `agent-tool-not-exposed`). 주입: AkuAssistant
    `agentSurface` 필수 prop ← DesignPage `editorMode.agent`.
  - **P2**: `pieces/agent-surface.ts` — PAGE 표면 = pass-through 40 +
    어댑터 5(item.add/chart.add/paste/reparent/batch) + 신규 노출명
    `weave.page.add`(item.add 랩핑: kind=frame/containerId=root/FULL_FRAME
    스탬프, 스프레드 뒤 스탬프라 에이전트가 override 불가). pageLine
    하드코딩 → `promptFragment` 흡수. 디커미션: `agent-page-target.ts`
    (+ 테스트) 제거, roundGroup의 retarget 호출 제거 (min-size/container/
    text-box 가드는 유지 — flavor-free).
  - **P3 회귀 1건 발견·수정**: bind 시점에 라이브 레지스트리 대상
    "unregistered command" loud-fail을 걸었더니 **첫 렌더 시점엔 커맨드
    등록 전(useWeaveEditor 이펙트가 마운트 후 등록)이라 page-bounded
    flavor 전체가 블랭크 마운트** (e2e 13파일 서브셋이 slide-deck 3건
    신규 red로 검출). 수정: 커맨드 해석을 lazy로 — bind 시점 loud-fail은
    정적 판정 가능한 것만(중복 exposedName / 스키마 누락), 등록 검증은
    `list()`(connect 시점) loud-fail로 이동. 단위 2건 추가(late
    registration / list-time loud-fail).
  - 검증: tsc clean · vitest 102파일/1042 green · 구조 게이트 5종 OK ·
    e2e 비교 서브셋 13파일 = 기준선 정확 복원(40 passed / 3 known-red:
    frame-handles:32, mode-gate-hardening:110, thumbnail-panel:216).
- 2026-06-11 (후속 fix, 사용자 보고): **프레젠테이션(page-bounded) 모드에서
  "에이전트 서버에 연결하지 못했어요" 배너** — P3에서 옮긴 `list()` loud-fail이
  원인. connect-on-init(eager) 이펙트가 useWeaveEditor 등록 이펙트보다 먼저
  실행되고 `connectAgocraftAgent`가 connect 동기 경로에서
  `deriveCommandSchemas → commands.list()`를 호출 → 빈 레지스트리에서 throw →
  connect 거부(조용히 삼켜짐). 프로브로 재현(mixed 연결·slide-deck 실패) 후
  connect-실패 console.error를 추가해 원인 확정. 수정: `list()`는 미등록 항목
  스킵(lazy resolve) — 도구 광고 `describe`는 서버 요청마다 재평가되는
  클로저라 등록 완료 후 전체 집합 노출, 드리프트는 coverage test 소유.
  connect-실패 console.error는 영구 유지(이번처럼 로컬 throw가 기본 배너
  뒤로 숨는 클래스의 진단 통로). 프로브로 양 flavor `byo-ssh · sonnet-4-6`
  연결 확인. DR-115 §7.3 갱신.
  - 잔여 리스크(수용): ① mapInput은 순수 입력 변환이라
    `frame.removeKeepingChildren`을 활성 페이지 자체에 적용하는 호출은
    막지 못함(문서 구조를 모름 — PAGE_AGENT_SURFACE doc comment에 기록).
    ② `weave.batch` 내부 op는 byName Map으로 직접 디스패치되어 roundGroup
    입력 가드를 우회 — pre-existing, 본 WI 비-scope. batch 어댑터는 inner
    op 번역(page.add/add 리타겟)은 수행.
- 2026-06-11 (3차 후속 fix, 사용자 보고): **프레젠테이션 모드 에이전트 편집 시
  ToolSearch 반복 호출 + 편집 커맨드 전부 실패**. 근본 원인은 2차 수정의 잘못된
  전제 — "도구 광고 describe는 서버 요청마다 재평가"는 사실이 아니며,
  small-think `createCommandTools`가 `describe()`를 **connect 시점 1회 동결**
  ("Read once per build"; 재연결도 같은 MCP 레지스트리 재사용). 위저드 신규
  디자인은 로컬 핸드오프로 즉시 로드 → connect-on-init(자식 이펙트)이 등록
  이펙트(부모)보다 같은 커밋에서 먼저 실행 → 빈 도구 집합 동결 → 에이전트는
  snapshot/capabilities만 가진 채 ToolSearch 루프. 네트워크-로드 디자인은
  창을 비껴가 flavor 의존처럼 보였으나 실은 로드-타이밍 레이스(프로브: 양
  flavor 모두 connect 시점 list()=0). 수정: `waitForRegisteredCommands` —
  getHandle이 connect 전 레지스트리 등록을 유한 대기(50ms 폴/상한 5s) + DEV
  `[aku connect] tool surface frozen at connect` 진단 영구 추가 + 마운트
  시점에 항상 count:0을 찍던 `[aku commands]` 진단을 1틱 지연으로 정정.
  검증: 단위 3건 추가(commands-ready.test.ts) · 1045 green · 게이트 5종 OK ·
  프로브(mixed 45/slide-deck 46 동결) · slide-deck 라이브 편집 1턴 성공.
  DR-115 §7.3 정정 + §7.7 신설.
