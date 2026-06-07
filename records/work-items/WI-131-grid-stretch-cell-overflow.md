# WI-131 — 세로 그리드 아이템이 셀보다 큰 높이로 넘치는 현상 (stretch만 정상)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | agocraft DR-046 (layout non-stretch clamp-to-cell) |
| Relates | `@agocraft/layout` auto-grid/auto-flex placement · vendor bump `1.0.0-rc.20260607000000` · e2e `grid-stretch-overflow.spec.ts` |

## Problem (operator, 2026-06-07)

세로 그리드(1열 × N행)에 들어간 아이템이 **자기 셀(행) 높이보다 큰 높이를 차지**해
이웃 행으로 넘침. `start`/`center`/`end` 정렬을 골라도 **변화가 없고**, `stretch` 를 한 번
설정해야 비로소 셀 크기로 들어맞음.

## Root cause

레이아웃 엔진은 절대 프레임을 계산하는 기하 시뮬레이터(실제 CSS flex/grid 아님). 자식의
셀 내부 고유 크기(`sizeW`/`sizeH`, flex 는 `crossSize`)는 **join/패러다임 전환/핸들 리사이즈
시점의 현재 프레임에서 캡처**된다. 아이템이 프레임을 꽉 채운 상태(비율 ≈ 1)에서 캡처되면
고유 크기가 ≈ 부모 전체가 되고, 비-stretch 정렬 공식이 그 값을 그대로 써서 셀을 넘침.
`stretch` 만 셀 크기(`availableAxis`)를 써서 유일하게 들어맞았다. 1열×3행 재현:

- start → height 1.0 (패치 미발생 = "변화 없음"), center/end → 1.0 (y 음수, 행 넘침)
- stretch → 0.333 (셀에 맞음)

## Change (agocraft `@agocraft/layout`, DR-046)

비-stretch 자식의 축 크기를 **셀/라인 가용 크기로 clamp**:

- `auto-grid-placement.ts` `axisStart/Center/End`: `size = min(childAxisSize, availableAxis)` (양축)
- `auto-flex-formulas.ts` `alignStart/Center/End`: `crossSize = min(childCrossSize, availableCross)` (교차축만)
- flex 주축은 의도적으로 미적용(grow/shrink 영역, CSS 오버플로 보존)

셀보다 작은 자식은 그대로 자기 크기+정렬 유지. 셀보다 큰 고유 크기는 셀로 clamp → 모든
정렬에서 셀 안에 안착(=stretch 와 동일). agocraft 에서 재패키징 후 weave 3곳 override 갱신 +
`pnpm install`(`+1 −1`).

## Acceptance

- [x] agocraft `packages/layout` 유닛 239 pass (회귀 블록 추가: auto-grid "cell clamp", auto-flex "cross-axis clamp")
- [x] weave 라이브 e2e `grid-stretch-overflow.spec.ts` 2 pass — 1×3 그리드 `sizeH=0.9` 자식이
      start/center/end/stretch 모두 1/3 셀로 clamp; `sizeH=0.2` 자식은 start 에서 0.2 유지
- [x] 기존 레이아웃 e2e (`layout-child-props`, `layout-relayout-verify`) 6 pass — 회귀 없음
- [x] 활성 링크가 새 tgz(`...20260607000000`) 로 해석되고 dist 에 `clampToCell`/`clampCross` 포함 확인
- [x] **CSS 전수 대조 하니스** `e2e/layout-css-parity.spec.ts`: 벤더 엔진 출력 vs 실제 브라우저 CSS
      (FLEX 120/120, GRID 224/224 자식 프레임 일치 ±4px). 의도적 차이(DR-046 clamp)는 별도 버킷에서 확인.
