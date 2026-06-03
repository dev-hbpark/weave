# Feasibility Review — FR-017 일반화된 차트 데이터 모델 (14 family, 타입드-채널 인코딩)

## Metadata

| Field | Value |
|---|---|
| ID | FR-017 |
| Question | weave 가 관리하는 차트 데이터 모델을 **단일 타입드 테이블 + 그래픽-문법 채널 인코딩**으로 일반화하면, 14개 차트 타입(bar/line/area/pie/scatter/bubble/radar/heatmap/funnel/gauge/candlestick/boxplot/treemap/sankey)을 **하나의 데이터 포맷 + 하나의 인코딩 스킴**으로 표현·렌더할 수 있는가? |
| Verdict | **FEASIBLE** (트레이드오프: 번들 모듈 lazy 등록, 사전집계 입력, 1차 aggregate 미포함) |
| Owner | hbpark |
| Date | 2026-06-03 |
| Pairs with | DR-036 / WI-079 |

## 이상(promise) vs 현재 기술이 줄 수 있는 것

**이상**: "모든 차트가 일반적으로 가질 수 있는 명칭·포맷"의 단일 데이터 모델 → 차트 추가가 데이터 모델을 건드리지 않음.

**현재 기술**: 그래픽 문법(Wilkinson; ggplot2/Vega-Lite/ECharts `dataset`+`encode` 가 검증)이 정확히 이 문제를 위한
산업 표준이다. 핵심: **타입드 컬럼 + 채널→필드 매핑**. 14종 모두 ECharts series 로 매핑 가능(아래 검증).

## 검증 — 14종 × (필요 데이터 채널 → ECharts series)

| type | 데이터 채널 | ECharts 변환 | 가능? |
|---|---|---|---|
| bar/line/area | category + value(multi) [+series] | category xAxis + value series(area=areaStyle) | ✅ (기존) |
| pie/doughnut | category + value | pie series, radius=[inner,outer] | ✅ (기존) |
| funnel | category + value | funnel series `{name,value}` | ✅ |
| gauge | value | gauge series `[{value}]` | ✅ |
| scatter | x + y (quant) | scatter `[[x,y]]` | ✅ |
| bubble | x + y + size | scatter + `symbolSize` from 3rd | ✅ |
| radar | category(지표) + value(multi/series) | radar `indicator[]`(category distinct) + series `{value:[...]}` | ✅ |
| heatmap | x(cat) + y(cat) + value | heatmap `[[xIdx,yIdx,v]]` + visualMap | ✅ |
| candlestick | category(temporal) + open/high/low/close | candlestick `[[o,c,l,h]]` | ✅ |
| boxplot | category + lower/q1/median/q3/upper | boxplot `[[low,q1,med,q3,high]]` (사전집계) | ✅ |
| treemap | id + parent? + value | id/parent edge-list → nested data | ✅ |
| sankey | source + target + value | sankey nodes + links `{source,target,value}` | ✅ |

→ **전 항목 ECharts 매핑 성립**. 단일 테이블이 계층(id/parent)·그래프(source/target)까지 edge-list 로 수용.

## 트레이드오프 / 불가피한 제약

1. **번들**: 14 series 모듈을 전부 `use()` 하면 echarts 청크가 커짐. → `spec.echartsModules` 로 **사용된 chartType 의
   모듈만 동적 등록**(1패스 register). 현재 lazy echarts 청크(193KB gz) 전략과 양립.
2. **사전집계 입력**: boxplot 5요약·candlestick OHLC 는 **이미 계산된 컬럼**을 기대(원시→집계 transform 은 1차 제외).
   → `FieldRef.aggregate` 자리만 예약, 후속.
3. **변환 transform**: radar 지표 추출·heatmap 축 인덱싱·treemap nesting·sankey 노드셋은 순수 build 단계 transform 필요
   (echarts-option 빌더 내부, 단위 테스트 가능).
4. **마이그레이션**: `columns: string[]`·`{category,values}` 영속 데이터 → 로드 시 1회 마이그레이션(타입 추론 + 채널 변환),
   round-trip 무손실(`onUnknown:preserve`).
5. **인코딩 UX 복잡도**: 채널이 많아짐(최대 ~5/타입). → UI 는 `spec.channels` 만 렌더(타입별 필요 슬롯만 노출)해 사용자
   인지부하 제한.

## 결론

**FEASIBLE.** 그래픽-문법 모델이 14 family 를 단일 포맷으로 일반화하는 검증된 방법이며 ECharts 와 1:1 매핑된다. 선행
작업(타입드 컬럼 + 채널 인코딩 + ChartTypeSpec 레지스트리 + 마이그레이션)을 끝내면 차트 추가는 데이터 모델 무변경으로
레지스트리 엔트리 1개가 된다. DR-036 에서 모델 확정.
