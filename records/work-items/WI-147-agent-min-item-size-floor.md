# WI-147 — 에이전트 추가 아이템 최소 크기 하한 (생성 거부 + 이유 전달)

Status: **Done** (코드/단위 검증 완료 · 에이전트 실호출 캔버스 확인 권장)
Owner: hbpark
Updated: 2026-06-08
관련: [DR-100](../decisions/DR-100-agent-min-item-size-floor.md) ·
선례 WI-143/DR-098(agent 텍스트 고정 박스, 동일 transformInput 파이프라인) ·
DR-091(agent px→ratio 폰트 그라운딩) · DR-078(zero-frame 복원 가드, 보완)

## Problem

에이전트가 아이템을 추가할 때 **추가 후 최종 px 크기**가 너무 작으면(보이지 않는 speck) 막고 싶다.
기준은 **긴 변 ≥ 10px AND 면적 ≥ 20px²**. 위반 시도는 **생성하지 않고(거부)**, 그 **결과와 이유를 아쿠
에이전트에게 전달**해 같은 실수를 반복하지 않게 한다. 적용은 **에이전트 추가 경로에 한정**(수동 드래그 무영향).

## 사용자 결정 (질의 응답)

- 기준식: **긴 변 ≥ 10px AND 면적 ≥ 20px²** (1차 "짧은 변" → 얇은 구분선 오탐/면적 조건 무의미 문제로 "긴 변"
  으로 변경. 두 임계가 독립 발화: 2px×400px 구분선 통과, 3×3 speck·200×0.05 슬리버 거부)
- 적용 범위: **아쿠 에이전트 추가만**
- 위반 동작: **생성 거부 + 이유 메시지**

## 설계 결론

- 절대 px = `설계 px(1920×1080 등) × 조상 비율 곱 × 스테이징 프레임 비율`. flex/grid 자식은 명령 내부
  레이아웃 스테이징 이후에만 정확 → 가드는 **명령 내부, 스테이징 직후, patch emit 직전**.
- 정확 px + "생성 거부"를 동시에 만족하는 유일 지점이 명령 내부. 에이전트 전용은 입력 플래그
  (`enforceMinSize` + `designWidth/Height`)로 게이팅하고, 이 플래그는 agent-only `transformInput`에서만 주입.
- kind 예외: `text`=너비만, `line`=길이만, 그 외=긴 변 AND 면적. px 미산출 시 fail-open(허용).

## 변경 (touch points)

- **수정** `apps/web/src/document/commands.ts`
  - `absoluteFrameBox` import 추가.
  - `MIN_ITEM_SIDE_PX=10` / `MIN_ITEM_AREA_PX2=20` 상수 + `checkAddedItemMinSize()`(export, 순수, kind-aware,
    box는 긴 변 기준).
  - `AddItemInput`에 옵션 `enforceMinSize` / `designWidth` / `designHeight`.
  - `weave.item.add` `run`: 스테이징 직후 가드 → 미달이면 `fail("item-too-small", <한국어 이유+조치>)` (patch 0개).
- **신규** `apps/web/src/features/aku/agent/agent-min-size-guard.ts`
  - `stampMinSizeGuard(commandName, input, design)` 순수 변환 — `weave.item.add`에 가드 플래그+설계 px 주입.
- **수정** `apps/web/src/features/aku/agent/use-aku-agent.ts`
  - transformInput 합성: `fixAgentTextBox → groundAgentFontSize → stampMinSizeGuard`.
- **수정** `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - SIZING §1에 "MIN SIZE FLOOR" 절(사전 사이징 + item-too-small 재시도 금지 안내).
- **테스트** `apps/web/src/document/commands.test.ts`
  - 예측자 단위(box/ text/ line/ 임계값) + 명령 거부/허용/수동무영향/fail-open.

## 검증

`pnpm typecheck` clean · `biome check` clean · `pnpm vitest run` **846 pass**(신규 10 포함).
에이전트 실호출 시 캔버스에서 거부 메시지 노출 확인 권장.

## 동작 특성 (DR-100 참조)

box kind는 **긴 변 ≥ 10px AND 면적 ≥ 20px²** — 두 임계가 독립 발화. 2px×400px 구분선은 통과(긴 변 400·면적
800), 3×3 speck(긴 변 3)·200×0.05 슬리버(면적 10)는 거부. 임계 조정은 `checkAddedItemMinSize` box 분기 +
`MIN_ITEM_SIDE_PX`/`MIN_ITEM_AREA_PX2`만 수정.
