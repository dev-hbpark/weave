# Decision Record — DR-037 차트 내부 요소 계층 선택·편집 (series / datum override)

## Metadata

| Field | Value |
|---|---|
| ID | DR-037 |
| Title | 차트 내부 요소를 **계층적으로 선택·편집**한다: 범례 클릭 = **시리즈 전체** 선택(색·외곽선 일괄), 마크(바/슬라이스) 클릭 = **데이터 하나** 선택(부분). override 는 `series`(전체) + `datum`(부분) 2계층이며 **데이터가 시리즈를 덮는다**. 값 편집·행 삭제는 데이터 선택에서만. 위치·크기 등 차트 레이아웃이 강제하는 속성은 비편집(제외). |
| Decision Level | **1 Project-local** — weave-side. |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-03 AskUserQuestion: 「범례=시리즈, 마크=데이터」 + 「데이터가 시리즈를 덮음」) |
| Status | **Accepted** |
| Decided on | 2026-06-03 |
| Amends | DR-035 — 원안 §2 의 `overrides.series`(설계만 됨)를 구현·계층 선택 추가. |

## Context

DR-035/WI-078 구현은 마크 클릭 → `overrides.datum[category]`(부분) 만 있었다. 사용자는 "차트=프레임, 바=프레임 내부
아이템처럼" 차트 내부 요소를 **계층적으로** 선택해 조작하길 원함 — 상위(시리즈) 선택 시 일괄, 하위(데이터) 선택 시
부분. 위치처럼 차트 속성이 강제 결정하는 것은 제외, 색·외곽선·데이터 같은 **조작 가능 속성만**.

## Decision

### 1. override 모델 (2계층)

```ts
interface ChartOverrides {
  readonly datum?: Readonly<Record<string, ChartDatumStyle>>;   // 부분 (category 키) — 우선
  readonly series?: Readonly<Record<string, ChartDatumStyle>>;  // 전체 (series 이름)
}
// ChartDatumStyle = { color?, borderWidth?, offset? } 재사용 (series 는 color/borderWidth)
```

### 2. 우선순위 = 데이터 > 시리즈 > 팔레트

ECharts 자체 병합 활용: `series.itemStyle` = 시리즈 override(전체 기본), `series.data[i].itemStyle` = 데이터 override
(그 위 덮음). 별도 머지 로직 불필요. cartesian/pie/funnel 등 category+value family 에 적용.

### 3. 선택 (범례=시리즈, 마크=데이터)

```ts
interface ChartElementRef {
  readonly chartItemId: string;
  readonly role: "series" | "datum";       // mark → datum 로 일반화
  readonly seriesName?: string;            // 둘 다
  readonly category?: string;              // datum
  readonly rowIndex?: number;              // datum (값 편집/삭제)
  readonly value?: number;                 // datum
}
```

- **마크 클릭** → `role:"datum"`(category+seriesName+rowIndex+value). 기존 경로.
- **범례 클릭** → `role:"series"`(seriesName). 렌더러가 `legendselectchanged` 를 가로채 **선택으로 전용**하고
  `legendAllSelect` 로 가시성 복원(범례 = 시리즈 셀렉터, 토글 아님).
- **클릭→역할 매핑은 패밀리별 레지스트리**(`chart-selection.ts:markSelection`/`legendSelection`, Rule 6) — 인라인
  `chartType ===` 분기 제거. cartesian/matrix: mark=datum·legend=series. part-to-whole/hierarchy/flow: legend=datum.
  **polar(radar): mark=시리즈**(폴리곤=시리즈, seriesName=`info.category`). 차트 타입 추가 시 패밀리 분류만 하면 됨.
- **radar 범례 한계**: 이 ECharts 빌드에서 radar 범례는 `legendselectchanged` 를 리스너로 방출하지 않음(`selected`
  토글만; `legendToggleSelect` dispatch 는 내부 `childAt` 에러) → radar 시리즈 선택은 **폴리곤 클릭**(mark=series)이
  신뢰 경로. cartesian 범례=시리즈 경로는 정상.

### 4. 편집 surface (역할별)

- `datum` → 색·외곽선(`overrides.datum[category]`) + 값(데이터셋 setCell) + 행 삭제. (기존)
- `series` → 색·외곽선(`overrides.series[seriesName]`). 값·삭제 없음(시리즈엔 단일 값/행 없음).
- 위치·크기·축 등 레이아웃 속성은 어느 레벨에서도 비노출(차트 속성이 강제).

## Consequences

- 신규: 시리즈 레벨 override + 범례-as-셀렉터 + 역할별 에디터. anchor 키 = 시리즈 이름(범례와 일치), 데이터 = category
  (안정 키, reorder 견딤).
- round-trip: `overrides.series` 도 무손실 보존(미지 보존 + 명시 직렬화).
- 한계(후속): 다중-시리즈에서 데이터 override 키가 category 단일 → 같은 category 가 여러 시리즈에 걸치면 함께 적용
  (단일-시리즈/파이는 정확). per-(series,category) 정밀 데이터 키는 후속.
- 후속 해소(2026-06-03): per-(series,category) 정밀 키(`datumOverrideKey`, NUL 구분) + radar 시리즈 override
  (`radarSeriesStyle`) + 패밀리별 클릭 라우팅(`chart-selection.ts`) 완료. 상세 WI-088 후속 1·2.

## SOLID/GRASP gate

- Rule 6: override→itemStyle 주입은 per-속성 매퍼(`itemStyleFor`) 재사용, switch 없음. 역할 분기는 에디터의 데이터
  주도(role 별 컴포넌트), 빌더는 series/datum 두 주입점.
- 단일 진실원: 데이터=데이터셋, 표현=overrides(series/datum), 위치=차트 레이아웃(비편집). 경계 유지.
- 안정 키: series=이름, datum=category.

## Links

- DR-035(원안), [WI-088](../work-items/WI-088-hierarchical-chart-element-editing.md)
- 구현: `domains/chart/{chart-element-context.tsx, chart-overrides.ts, echarts-option.ts, echarts-renderer.tsx, ChartBlock.tsx}`, `toolbar/sections/chart-element-editor.tsx`, `types.ts`
