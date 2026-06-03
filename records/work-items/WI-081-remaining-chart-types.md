# WI-081 — 나머지 10개 차트 타입 (14종 완성)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

WI-079 일반화 모델 + WI-080 레이더 위에서, DR-036 의 나머지 10종을 우선순위대로 전부 추가해 **14 family 완성**.

## 우선순위 (노력 오름차순)

area → funnel → gauge → scatter → bubble → heatmap → candlestick → boxplot → treemap → sankey.

## 선행 리팩터 — `ChartRenderInput` 가 전체 인코딩을 운반

scatter(x/y)·candlestick(OHLC)·sankey(source/target) 등은 category+series 로 부족 → `ChartRenderInput.{category,series}`
→ **`encoding: ChartEncoding`** 로 교체. 모든 빌더가 채널 accessor 로 필요한 채널만 읽음. `field(enc,channel)` 헬퍼.
ChartBlock 플롯가능성 판정은 `requiredChannelsSatisfied(type, enc)`(스펙의 required 채널 충족) 으로 일반화 — bar-전용
"value 존재" 검사 대체. 기존 빌더(bar/line/pie/radar) + 3 테스트 input() 헬퍼 갱신. 회귀 0.

## 구현 (각 = 빌더 + 레지스트리 엔트리 + 모듈, 데이터 모델 무변경)

| 타입 | family | 채널 | ECharts |
|---|---|---|---|
| area | cartesian | category + value(multi) | LineChart + areaStyle |
| funnel | part-to-whole | category + value | FunnelChart (sort desc) |
| gauge | part-to-whole | value | GaugeChart (첫 행, niceCeil max) |
| scatter | cartesian | x + y | ScatterChart `[[x,y]]` |
| bubble | cartesian | x + y + size | ScatterChart + symbolSize(size) |
| heatmap | matrix | x + y + value | HeatmapChart + VisualMapComponent, 축 인덱싱 |
| candlestick | cartesian | category(시간) + open/high/low/close | CandlestickChart `[o,c,l,h]` |
| boxplot | cartesian | category + lower/q1/median/q3/upper | BoxplotChart `[lo,q1,m,q3,up]` |
| treemap | hierarchy | id + value (+parent) | TreemapChart, (id,parent) edge-list→nested |
| sankey | flow | source + target + value | SankeyChart, node set + links |

- `echarts-renderer.tsx`: 12 charts + VisualMapComponent 모듈을 lazy 청크에 `use()`(메인 번들 무영향).
- 인코딩 UI: P4 spec-구동이라 각 타입 채널이 **자동 렌더**(x/y/OHLC/source·target 셀렉트, value 칩). 파일 수정 0.

## Gate / 검증

- 유닛 **469 green** — 신규 builder 테스트(area areaStyle, funnel/gauge, scatter/bubble symbolSize, heatmap visualMap·축인덱싱,
  candlestick/boxplot 데이텀 순서, treemap nesting, sankey node/link) + `requiredChannelsSatisfied` 게이트.
- e2e **chart 12/12** — `all 14 chart families render`: 각 타입에 맞는 데이터셋+인코딩으로 전환 → svg+marks 렌더 +
  **console/pageerror 수집해 "모듈 미import" 0 검증**(누락 모듈 탐지).
- tsc/biome 클린. 빌드: echarts lazy 청크 197→**242KB gz**(+9 series 모듈, 메인 번들 무변경).

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [WI-079](../work-items/WI-079-generalized-chart-data-model.md), [WI-080](../work-items/WI-080-radar-chart.md), [FR-017](../feasibility-reviews/FR-017-generalized-chart-data-model.md)
- 구현: `domains/chart/{echarts-option,chart-types,echarts-renderer,ChartBlock}.tsx?`

## 후속 (선택)

- 채널-heavy 타입 UX 다듬기(candlestick/boxplot 의 5~6 슬롯 정렬, treemap/sankey 텍스트-아이템 레이블).
- long-format `series` 채널(빌더 지원) → cartesian 시리즈 분할.
- aggregate(sum/mean) transform(원시→집계, boxplot 자동 계산).
- 번들: `spec.echartsModules` 기반 사용 타입만 동적 `use()` 등록(현재 전량 등록).
