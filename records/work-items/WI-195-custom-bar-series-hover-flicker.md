# WI-195 — per-bar-width 차트 호버 깜박임 (custom series → silent + zr hit-test)

- 상태: DONE (2026-06-12)
- 출처: "차트 내부(요소 드릴) 선택 후 호버링 시 차트 프레임 전체가 깜박인다.
  단일 바의 두께(width)나 높이(value) 조정 후에도 문제." 사용자 신고.
- 선행: WI-092 (차트 직접조작 핸들 + custom per-bar-width 렌더러 + element 클릭/
  hover-reveal 배선), WI-192/193 (핸들 커버리지 — 본 버그와 무관, 동시기 작업)

## 증상

차트 요소(바)를 드릴한 뒤 **단일 바의 두께를 조절**(→ `overrides.datum[cat].barWidth`)
하면 차트가 ECharts **`type:"custom"` per-bar-width 렌더러**로 전환된다. 이후
포인터를 차트 위에서 움직이면 **차트 프레임 전체가 깜박인다**.

## 진단 (계측으로 root cause 확정)

라이브 :5179 + MutationObserver로 호버 중 변화를 계측. **핵심: childList가
아니라 SVG path의 ATTRIBUTE 변화를 봐야 했다**(ECharts SVGRenderer는 속성으로
리페인트). 2초 이동 호버 동안 SVG 변화:

| 상태 | mutations |
|---|---|
| 차트 선택 / 일반 바 드릴 | 0 |
| 값(높이) 편집 후 (일반 bar series) | 0 |
| **두께 오버라이드 후 (custom series)** | **111** ← 깜박임 |

→ **원인: non-silent `custom` 시리즈는 pointer-move마다(마크 간 mouseover/
mouseout 전이) `renderItem`을 재호출해 rect의 SVG 속성을 ~3×/move 다시 쓴다.**
일반 bar/line은 ECharts가 호버 리드로우를 스킵해 문제없음(0).

무효한 레버(전부 111 유지, 측정): `emphasis:{disabled:true}`(withStaticInteraction이
이미 적용)·`blur`·`select:{disabled}`·`animation:false`·`hoverLayerThreshold:∞`·
고정 스타일(api.style() 제거). **유일하게 0으로 만든 것: `silent:true`.**

## 해결

1. **custom 시리즈 `silent: true`** (`echarts-option.ts` customBarSeries) — 호버
   재호출 제거 → 0 mutations.
2. silent은 마크의 ECharts 마우스 이벤트(클릭·mouseover)를 전부 끊으므로,
   그 둘을 **zrender 레벨 hit-test로 복원** (`echarts-renderer.tsx`):
   - `customBarHitAt(chart, x, y)`: custom 시리즈일 때 `containPixel(grid)` +
     `convertFromPixel`로 카테고리 밴드/값 범위 hit → ChartClickInfo. 전체
     카테고리 밴드가 hit 영역(컬럼 클릭=그 바 선택), 세로는 바 값 범위로 한정
     (위 빈 영역은 blank).
   - zr `"click"`: hit → `onElementClick`(드릴 복원). hit 없음 + (target null ‖
     custom-grid 내부) → `onBackgroundClick`(빈 영역 해제).
   - zr `"mousemove"`(custom 차트만): hit → `chartHoverStore.set`(글로벌 폭
     핸들 hover-reveal 복원). `"globalout"` + no-hit → 60ms 디바운스 clear.
   - 일반 시리즈는 기존 `chart.on("click"/"mouseover")` 경로 그대로(고속 early-return).

## 검증 (Continuous Self-Verification)

- 신규 회귀 e2e `chart-custom-series-hover.spec.ts` (라이브 :5179):
  - custom 시리즈 이동 호버 → SVG mutations **≤4 (실측 0)** (이전 111).
  - custom(silent) 바 실제 클릭 → 드릴(value handle 표시) **복원**.
- 무회귀: WI-092 핸들 e2e **8/8**(custom 폭 핸들·per-bar 렌더·CHART-level 폭 포함),
  chart-item element 선택·범례·값편집 + 매트릭스(gauge/scatter) green, 차트
  유닛 **136**, `tsc` 0, 게이트(lint·Rule6·inheritance) green.
- ⚠️ `chart-item WI-081`(14종 일괄 렌더)은 **선재 실패**(ECharts 라이브러리 내부
  funnel/candlestick dev 렌더 오류, 본 변경 무관 — git stash 클린코드도 동일).

## 산출물

- 코드: `echarts-option.ts`(custom 시리즈 `silent:true`),
  `echarts-renderer.tsx`(`customBarHitAt`/`isCustomBarChart` + zr click/mousemove/
  globalout hit-test).
- 테스트: `chart-custom-series-hover.spec.ts`(신규 2).
- 기록: 본 WI.

## 메모 (재발 방지)

- ECharts custom 시리즈를 weave가 "정적 렌더러"로 쓸 땐 **반드시 `silent:true`**
  + zr 레벨 상호작용. `emphasis.disabled`만으론 custom의 호버 renderItem
  재호출을 못 막는다.
- 차트 리페인트 디버깅은 **childList가 아니라 attribute MutationObserver**로 볼 것
  (SVGRenderer는 path 속성으로 리드로우).
