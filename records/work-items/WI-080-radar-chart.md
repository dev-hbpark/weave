# WI-080 — 레이더 차트 (polar family — 일반화 모델 첫 후속 타입)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

WI-079 의 일반화된 차트 모델(DR-036) 위에서 14종의 첫 타입으로 **레이더(radar)** 를 추가. 일반화가 의도대로면
데이터 모델 변경 없이 레지스트리 엔트리 + 빌더 + ECharts 모듈만으로 추가되어야 함(검증 목적도 겸함).

## Decision / 구현

DR-036 의 ChartTypeSpec 레지스트리 패턴을 그대로 따름 — **데이터 모델 무변경**:

- **레지스트리 엔트리** (`chart-types.ts`): `radar` = family `polar`, label "레이더", channels `category(지표, KEYS)` +
  `value(값, multiple, QUANT)`. 신규 ChartTypeSpec 1개.
- **빌더** (`echarts-option.ts:radarOption`): **wide 레이아웃** — 각 ROW = 지표 축(category 컬럼으로 명명), 각
  VALUE 컬럼 = 시리즈 폴리곤. 지표별 축 `max` = 시리즈 across 최댓값(각 지표가 자기 범위로 스케일). `radius:"65%"`.
- **모듈** (`echarts-renderer.tsx`): `use([..., RadarChart])` — RadarChart 가 radar 좌표계 포함(별도 컴포넌트 불필요,
  브라우저 검증).
- **UI**: chart-section 의 타입 피커가 레지스트리 구동이라 "레이더"가 **자동 노출**(파일 수정 0). 단일 값 컬럼 →
  1 폴리곤(현재 단일-값 UI). 다중 시리즈(value multi)는 spec-구동 채널 UI(P4 확장) 후속.
- **레이블**: radar 지표명은 ECharts 자체 렌더(polar tip 배치는 pie 와 동일 사유로 연기, FR-016). `desiredLabels` 가
  radar 에 `[]` 반환 → 관리형 텍스트-아이템 레이어 비움(엉뚱한 cartesian 레이블 방지).

## Gate / 검증

- 유닛: `echarts-option.test` radar(지표 max + 시리즈 폴리곤), `chart-types.test`(레지스트리 radar/polar, 가용 타입
  ["bar","line","pie","radar"]). 차트 유닛 **40 green**.
- e2e(실 Chromium): bar→radar 전환 시 `data-chart-type="radar"` + ECharts `<svg> path` 렌더(모듈 등록·polar 옵션
  유효성 입증), 관리형 레이블 0개. chart e2e **10/10**.
- tsc/biome 클린, 빌드 청크 분리 유지(echarts 197KB gz, RadarChart +~4KB).

## 후속 (남은 12종, 동일 패턴)

cartesian(area/scatter/bubble/heatmap/candlestick/boxplot), part-to-whole(funnel/gauge), hierarchy(treemap),
flow(sankey). 각 = 레지스트리 엔트리 + 빌더 + 모듈. **다중-값(multi) 채널 spec-구동 UI**(radar/heatmap 등에 유용)는
P4 확장으로 별도.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [WI-079](../work-items/WI-079-generalized-chart-data-model.md), [FR-017](../feasibility-reviews/FR-017-generalized-chart-data-model.md)
- 구현: `domains/chart/{chart-types,echarts-option,echarts-renderer,chart-label-sync}.ts`
