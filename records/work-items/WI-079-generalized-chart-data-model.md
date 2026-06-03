# WI-079 — 일반화된 차트 데이터 모델 (14 차트 타입 추가의 선행 작업)

Status: **Done** (선행 일반화 P1~P5 구현·검증 완료 — DR-036/FR-017. 14-type 빌더는 후속 WI-080+)
Owner: hbpark
Updated: 2026-06-03

> **구현 완료(2026-06-03)** — P1 타입드 컬럼(`DatasetColumn{name,type}` + 읽기경계 마이그레이션 + 그리드 타입
> 셀렉터) · P2 채널 인코딩(`chart-model.ts`: `ChartEncoding`/`migrateEncoding`/accessors, bar/line/pie 이관) · P3
> ChartTypeSpec 레지스트리(`chart-types.ts`: `CHART_TYPE_REGISTRY`+`buildChartOption` 단일 디스패치) · P4 차트타입
> 피커 레지스트리-구동 · P5 QA. **검증**: 유닛 455 green(신규 inferFieldType/migrate/chart-model/registry 테스트),
> 차트 e2e 9/9 + history/text 회귀 0(`text-item:829`는 기존 실패), tsc/biome 클린, 빌드 청크 분리 유지(echarts 193KB
> /DatasetGrid 14KB gz). 구 `{category,values}`·bare-string 컬럼 경로는 읽기경계 마이그레이션으로 하위호환.

## Problem

차트 데이터 모델이 `{category, values[]}` 인코딩 + 타입 없는 `columns: string[]` 에 묶여 bar/line/pie 만 표현. 사용자는
레이더를 포함한 상위 14종(BI 10 + Candlestick/Boxplot/Treemap/Sankey)을 추가하려 하며, 그 전에 **모든 차트가 공통으로
가질 수 있는 명칭·포맷의 일반화된 데이터 모델**을 선행하길 원함.

## Decision

- **FR-017**: FEASIBLE — 그래픽 문법(타입드 컬럼 + 채널 인코딩)이 14 family 를 단일 포맷으로 일반화, ECharts 1:1 매핑.
- **DR-036**: (1) `DatasetColumn{name,type}` 타입드 테이블, (2) `ChartEncoding` 채널 맵, (3) `ChartTypeSpec` 레지스트리
  (채널 스펙 + 빌더 + 모듈), (4) 로드 마이그레이션. 신규 타입 = 레지스트리 엔트리 1개(Rule 6).

## Scope (이 WI = 선행 일반화만; 14종 구현은 후속 WI)

**In**: 데이터 모델/인코딩/레지스트리 일반화 + 기존 bar/line/pie 를 새 모델로 이관 + 마이그레이션 + round-trip 게이트 +
인코딩 편집 UI 데이터-주도화. **변경 후에도 bar/line/pie 동작·테스트 동일(그린).**

**Out (후속 WI-080+)**: 14종 빌더 실제 구현(scatter/radar/heatmap/… 각 family), 인코딩 편집기 family 별 미세 UX,
aggregate transform, 라벨 투영(DR-035)의 family 별 레이아웃 확장.

## Phases (요약 — 상세 `features/chart-item/CHART_MODEL_GENERALIZATION.md`)

- **P1 — 타입드 컬럼**: `DatasetColumn{name,type,format?}`, `DatasetCell` += boolean/null. `inferFieldType`. 데이터셋
  커맨드/그리드/round-trip 갱신. 마이그레이션 `string[]→DatasetColumn[]`.
- **P2 — 채널 인코딩**: `FieldType`/`FieldRef`/`ChartEncoding`/`Channel`. `ChartAttrs.encoding` 이관 + `variant`. bar/line/pie
  빌더를 채널 입력으로 전환. 마이그레이션 `{category,values}→채널맵`.
- **P3 — ChartTypeSpec 레지스트리**: `chart-types.ts` 신규(`CHART_TYPE_REGISTRY`: channels+buildOption+echartsModules+family).
  `echarts-option.ts` 의 BUILDERS 를 레지스트리로 이관. 렌더러·UI 가 레지스트리 소비(동적 `use()` 모듈 등록).
- **P4 — 인코딩 편집 UI 데이터-주도화**: `chart-section.tsx` 가 `spec.channels` 순회로 슬롯 피커 렌더(`accepts` 필터).
  bar/line/pie UI 회귀 0.
- **P5 — QA/Decommission**: round-trip(타입드 컬럼 + 채널맵) 무손실, 마이그레이션 단위 테스트, chart e2e 그린, 빌드 청크
  분리 유지. 구 `{category,values}` 경로 제거.

## Gate

- 기존 chart e2e/unit 전부 그린(이관 후 동작 동일). 새 마이그레이션·레지스트리·inferFieldType 단위 테스트 추가.
- round-trip: 타입드 컬럼 + 채널 인코딩 + variant 무손실. 미지 컬럼/채널 보존.
- 번들: echarts 청크 분리 유지, 사용 타입만 모듈 등록.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [FR-017](../feasibility-reviews/FR-017-generalized-chart-data-model.md)
- 후속: WI-080+ (14 차트 타입 family 별 구현)
- 관련: WI-077(chart+dataset), WI-078(interactive elements), DR-031/033/035
