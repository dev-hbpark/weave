# WI-150 — 에이전트 add 컨테이너=프레임 가드 (leaf containerId 거부 + 이유 전달)

Status: **Done** (코드/단위 검증 완료 · 에이전트 실호출 캔버스 확인 권장)
Owner: hbpark
Updated: 2026-06-09
관련: [DR-105](../decisions/DR-105-agent-container-is-frame-guard.md) ·
선례 [WI-147](WI-147-agent-min-item-size-floor.md)/DR-100(동일 agent-only `transformInput` + 명령 내부 거부 파이프라인) ·
DR-099(subtree.add 폐기 — 순차 add로 트리를 만들며 containerId 드리프트가 노출되는 배경) ·
무관(미변경): WI-149/DR-104(flex-row 텍스트 share — 이번 건은 sizing이 아니라 parenting 버그)

## Problem

아쿠에게 "달력을 만들어줘"라고 요청했을 때, 헤더 행(SUN…SAT)은 정상 생성되었으나 그 아래 채워질
**날짜 텍스트 31개가 모두 'SAT' 헤더 셀 하나에 들어가** SAT 칸이 영역 전체 높이로 부풀어 레이아웃을
삼킨 사례가 보고됨([Image] 캡처).

근본 원인은 레이아웃 엔진(auto-flex/auto-grid) sizing 버그가 **아님**. 진단:

- weave에서 **자식을 담을 수 있는 것은 `frame`(과 doc root, kind `weave-doc`) 뿐**이다. `text`/`shape`/
  `image`/`line`/`qr`/`chart`/`embed`는 모두 leaf다.
- `weave.item.add`는 호출마다 `containerId`(부모 id)를 **명시적으로** 받고, "직전에 만든 프레임"을
  기억하는 active-frame 상태가 전혀 없다(`apps/web/src/document/commands.ts`, `findContainer`).
- 에이전트가 순차 add를 만들면서 날짜들의 `containerId`를 **그리드 프레임이 아니라 직전에 만든 'SAT'
  텍스트 leaf**로 지정 → 31개가 leaf 밑에 중첩됨. 레이아웃 엔진은 그 잘못된 트리를 충실히 렌더해 한 셀이
  부풀었다(증상). 즉 **parenting 버그**.
- 프롬프트는 이미 "캘린더=auto-grid", "ONE ITEM PER CELL"을 명시(634줄). 지시 부족이 아니라 **위반해도
  런타임 피드백이 없는 것**이 문제.

## 결정 (요약 — 상세는 DR-105)

1. **명령 내부 거부 가드.** `weave.item.add`가 `containerId` 해석 직후(레이아웃 스테이징 전), 컨테이너가
   root가 아니고 `kind !== "frame"`이면 `fail("container-not-frame", <한국어 이유+조치>)` → patch 0개.
2. **에이전트 전용 게이팅.** WI-147과 동일 패턴. agent-only `transformInput`에 순수 변환
   `stampContainerGuard`를 추가해 `enforceContainerIsFrame:true`만 주입. 툴바는 이 프록시를 거치지 않아 무영향.
3. **design px 불필요 → 무조건 stamp.** min-size 가드와 달리 설계 px가 필요 없으므로 `transformInput`의
   `design === undefined` early-return **이전에** stamp(설계 크기 일시 부재에도 항상 작동).
4. **root 제외는 id로.** root는 kind가 `weave-doc`이라 kind 비교로는 못 거른다 → `String(id) === root.id`로 제외.

## 변경 (touch points)

- **수정** `apps/web/src/document/commands.ts`
  - `AddItemInput`에 옵션 `enforceContainerIsFrame?: boolean`.
  - `weave.item.add` `run`: `containerItem` 해석 직후 가드 → leaf면 `fail("container-not-frame", …)`.
- **신규** `apps/web/src/features/aku/agent/agent-container-guard.ts`
  - `stampContainerGuard(commandName, input)` 순수 변환 — `weave.item.add`에 플래그 주입.
- **수정** `apps/web/src/features/aku/agent/use-aku-agent.ts`
  - `transformInput`에서 `stampContainerGuard`를 design early-return 이전에 호출 + import.
- **수정** `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - `WEAVE_TASK_PRIMER`에 고-현저성 1줄 추가: "containerId IS THE PARENT FRAME, NEVER A LEAF" — 같은
    그리드/리스트 형제는 모두 같은 그리드 프레임을 containerId로, 직전 leaf에 이어 붙이지 말 것.
- **수정(테스트)** `apps/web/src/document/commands.test.ts`
  - "container-is-frame reject (WI-150 / DR-105)" describe 4케이스: leaf 거부 / frame 허용 / root 허용 / 무플래그 허용.

## 검증

- `npx vitest run src/document/commands.test.ts` → 128 passed(신규 4 포함).
- 타입체크: 터치 파일 에러 0.
- **남은 확인**: 아쿠 실호출로 달력/표 생성 시 (a) 에이전트가 leaf containerId를 안 쓰게 되는지, (b) 혹
  쓰더라도 `container-not-frame`를 받고 그리드 프레임으로 재시도하는지 캔버스에서 관찰(Continuous
  Self-Verification).

## 한계 / 후속

- 이 가드는 **leaf를 부모로 지정한 경우(가장 유력한 기전)** 를 0-오탐으로 잡는다. 만약 SAT가 leaf가 아니라
  **자체 layout 없는 프레임 셀**이었고 거기에 다중 자식이 쌓인 변형(B 기전)이라면 이 가드는 발화하지 않는다 —
  그 경우는 "auto-layout 부모의 무-layout 셀에 N개 누적" 같은 별도 가드가 필요하나 오탐 위험이 있어 보류.
  아쿠 실호출 텔레메트리에서 B 기전이 관측되면 후속 WI로 추가.
