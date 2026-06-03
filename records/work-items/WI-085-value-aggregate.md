# WI-085 — value 채널 aggregate (집계 transform)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

가장 흔한 실데이터 형태(집계 안 된 원시 행, 카테고리 반복 — 예: 거래 로그)를 그릴 수 없었다. 반복 카테고리를
wide 로 그리면 같은 x에 중복 막대가 나옴. sum/mean 등 **집계**가 필요.

## 구현 (long-format 그룹/레이블 기반 재사용)

1. **reducer 레지스트리** (`echarts-option.ts:AGG_FNS`) — sum/mean/count/min/max/median, 종류당 함수 1개
   (Rule 6, switch 없음). `aggregateRows(input)` — value 채널에 `aggregate` 가 있으면 (category[, series]) 그룹별로
   각 값 컬럼을 집계해 행을 collapse, 없으면 원본 통과.
2. **빌더 적용** — cartesianOption(bar/line/area)·pieOption·funnelOption 이 `aggregateRows` 결과를 사용. wide/long
   모두 호환(long 은 (category,series) 그룹).
3. **모델** (`chart-model.ts`) — `valueRefs`/`valueAggregate`/`setValueAggregate`(모든 값 필드에 집계 설정/해제).
   `FieldRef.aggregate` 예약 필드 실사용.
4. **레이블** (`chart-label-sync.ts`) — 집계 시에도 **distinct 카테고리** 레이블(중복 행 아님) + `rowIndices` 바인딩
   (WI-084 와 동일 — 조건을 `seriesField OR valueAggregate` 로 확장).
5. **UI** (`chart-section.tsx`) — `spec.aggregatable`(bar/line/area/pie/funnel=true) 인 타입에 "집계" Select 노출
   (없음/합계/평균/개수/최소/최대/중앙값). registry-구동 게이팅.

## Gate / 검증

- 유닛 **480 green** — AGG_FNS 빌더(sum/mean, +series 그룹), `setValueAggregate` 설정/해제/no-value no-op.
- e2e chart **15/15** — 신규 `value aggregate`: 반복 카테고리(A,A,B) 원시=3 레이블 → **UI "집계" 피커로 합계** 선택
  → encoding.value[0].aggregate="sum" + **distinct 2 레이블(A,B)**. wide/long/pie/radar/auto-encode 회귀 0.
- tsc/biome 클린, 빌드 OK.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [WI-084](../work-items/WI-084-long-format-series.md), [WI-083](../work-items/WI-083-chart-type-autoencode.md)
- 구현: `domains/chart/{echarts-option,chart-model,chart-types,chart-label-sync}.ts`, `toolbar/sections/chart-section.tsx`

## 후속 (선택)

타입별 샘플 데이터 시드, 번들 동적 모듈 등록, per-field 집계(현재 모든 값 필드 동일 집계).
