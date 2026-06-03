# WI-088 — 차트 내부 요소 계층 선택·편집 (시리즈/데이터 override)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

사용자: 차트 내부를 "프레임/내부 아이템처럼" 계층 선택해, **조작 가능한 속성(색·외곽선·데이터)** 만 조작하고 싶다.
상위(시리즈) 선택 시 일괄, 하위(데이터) 선택 시 부분. 위치 등 차트 레이아웃이 강제하는 건 제외. (DR-035 원안에
`overrides.series` 가 설계됐으나 미구현 — 이를 완성.)

## Decision (DR-037)

- 선택: **범례 클릭 = 시리즈 선택**, **마크 클릭 = 데이터 선택** (사용자 확정).
- override 2계층: `series`(전체) + `datum`(부분), **데이터가 시리즈를 덮음** (ECharts 자체 병합: series.itemStyle →
  datum.itemStyle).
- 값 편집·행 삭제는 데이터만. 위치/크기/축은 비편집.

## 구현

1. **모델** (`types.ts`, `chart-overrides.ts`): `ChartOverrides += series`. `setSeriesOverride`/`seriesOverride`. `setKeyed`
   공유 헬퍼 — 한 맵 편집이 **다른 맵을 보존**(데이터 편집이 시리즈 override 안 지움), 둘 다 비면 undefined.
2. **빌더** (`echarts-option.ts:cartesianOption`): `series.itemStyle = overrides.series[name]`(전체), datum override는
   기존대로 per-datum(위에 덮음). wide(값 컬럼명)·long(그룹값) 시리즈 이름 = 범례·override 키 일치.
3. **선택** (`chart-element-context.tsx`): `role: "mark" → "series" | "datum"`. series=seriesName, datum=category+rowIndex+value.
4. **범례 브릿지** (`echarts-renderer.tsx`): `legendselectchanged` 가로채 `onLegendClick(name)` + `legendAllSelect` 로
   가시성 복원(범례=셀렉터, 토글 아님). `ChartBlock`: pie/funnel 범례=카테고리(datum), 그 외=시리즈.
5. **에디터** (`chart-element-editor.tsx`): role 별 — series→`overrides.series`(색·외곽선), datum→`overrides.datum`+값+삭제.
   라벨 "시리즈: 매출" vs category.

## Gate / 검증

- 유닛 **485 green** — `setSeriesOverride`/2계층 보존(한 맵 비워도 다른 맵 유지), 빌더 series.itemStyle + datum 우선.
- e2e chart **17/17** — 신규 `legend click selects the SERIES`: 2-시리즈 막대에서 **범례 "매출" 클릭** → 에디터
  "시리즈: 매출" → 두께 → `overrides.series.매출.borderWidth=3`(datum override 없음). 기존 마크-클릭 emphasis/값/삭제
  회귀 0(role rename 무영향).
- tsc/biome 클린, 빌드 OK.

## 후속 1 — per-(series, category) 정밀 데이터 키 ✅ (2026-06-03, 이어서 구현)

다중-시리즈에서 데이터 override 가 category 단일 키라 같은 category 가 모든 시리즈에 적용되던 한계 해결:

- `chart-overrides.ts:datumOverrideKey(series, category)` = `${series}\0${category}`(NUL 구분).
- 빌더 `cartesianDatum`: **composite 키 → bare 키** 순서 조회(per-bar 정밀 + 레거시 category 공유 fallback).
- 에디터: `isMultiSeries`(값 컬럼 >1 OR series 채널) && seriesName → composite 키 기록, 단일-시리즈/파이는 bare(하위호환).
- 검증: 유닛 **487 green** — 2-시리즈에서 (a,Q1) override 가 a/Q1 만 칠하고 b/Q1 미적용 + bare category 는 전 시리즈 공유.
  (다중-시리즈 바 클릭 e2e 는 그룹 바 좌표 클릭이 flaky 라 유닛으로 정밀 커버; 단일-시리즈 마크-클릭 emphasis e2e 유지.)

## 후속 2 — radar 시리즈-레벨 override + 패밀리별 클릭 라우팅 ✅ (2026-06-03)

radar(polar) 폴리곤 = 시리즈 단위 override 완성. 더불어 클릭→역할 매핑을 레지스트리화(Rule 6).

- **빌더** (`echarts-option.ts:radarSeriesStyle`): `overrides.series[col]` → 해당 폴리곤 data item 의
  `itemStyle.color`(심볼) + `lineStyle.color/width`(선·두께). 나머지 폴리곤은 무변. 유닛으로 검증.
- **클릭 라우팅 레지스트리** (`chart-selection.ts`, 신규): `markSelection`/`legendSelection` 이 **패밀리별**
  역할(`series`/`datum`)을 결정 — `ChartBlock` 의 인라인 `chartType === "pie" || "funnel"` 분기(Rule 6 위반)를 제거.
  - cartesian/matrix: mark=datum, legend=series. part-to-whole: legend=datum(슬라이스). hierarchy/flow: legend=datum.
  - **polar(radar): mark=시리즈**(폴리곤=시리즈; 시리즈명은 `info.category`=param.name 에서). 차트 타입 추가 시 패밀리
    분류(레지스트리)만 하면 됨 — 이 파일 무수정.
- **radar 범례의 ECharts 한계**: 이 ECharts 빌드에서 radar 범례 클릭은 `selected` 가시성만 토글하고
  `legendselectchanged` 를 리스너로 **방출하지 않음**(`legendToggleSelect` dispatch 는 내부 `childAt` 에러).
  → radar 시리즈 선택은 **폴리곤 클릭**(mark=series)이 신뢰 경로. cartesian 범례=시리즈 경로는 정상(기존 e2e 유지).

### Gate / 검증

- 유닛 **502 green** — 신규 `chart-selection.test.ts`(8): cartesian mark=datum(+single-series seriesName 생략),
  pie mark/legend=datum, **radar mark=series(category→seriesName)**, radar/cartesian legend=series, treemap/sankey legend=datum.
  `echarts-option.test.ts`: radar 시리즈 override 가 매칭 폴리곤만 itemStyle+lineStyle, 타 폴리곤 무변.
- e2e chart **17/17** — `markSelection`/`legendSelection` 리팩터 후 전 기존 mark/legend/값편집/삭제 e2e 회귀 0.
  (radar 폴리곤·범례 좌표 클릭 e2e 는 헤드리스 flaky + ECharts radar 범례 버그라 유닛으로 정밀 커버 — WI-088 후속1
  다중-시리즈 바 e2e 와 동일 판단.)
- tsc/biome 클린, 빌드 OK(core 196KB gz · advanced 49.75KB gz 유지).

## 남은 후속

- pie 시리즈-레벨 override 는 N/A — pie 범례=슬라이스(카테고리)라 "시리즈" 개념·셀렉터 자체가 없음(설계상 datum 만).

## Links

- [DR-037](../decisions/DR-037-hierarchical-chart-element-editing.md), DR-035(원안), [WI-078](../work-items/WI-078-interactive-chart-elements.md)
- 구현: `domains/chart/{chart-overrides,echarts-option,chart-element-context,echarts-renderer,ChartBlock}.*`, `toolbar/sections/chart-element-editor.tsx`, `types.ts`
