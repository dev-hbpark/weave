# Decision Record — DR-036 일반화된 차트 데이터 모델 (타입드 컬럼 + 그래픽-문법 인코딩 + 차트타입 스펙 레지스트리)

## Metadata

| Field | Value |
|---|---|
| ID | DR-036 |
| Title | 차트 데이터 모델을 14개 차트 family 를 모두 표현하는 **그래픽 문법(grammar of graphics)** 모델로 일반화한다: (1) 데이터셋 컬럼에 **타입 선언**(nominal/ordinal/quantitative/temporal), (2) `{category, values[]}` 인코딩을 **시각 채널→필드 매핑**으로 일반화, (3) chartType→**ChartTypeSpec 레지스트리**(채널 스펙 + ECharts 빌더)로 UI·렌더러가 단일 소스를 읽는다. 신규 차트 추가 = 레지스트리 엔트리 1개(Rule 6, switch 없음). |
| Decision Level | **1 Project-local** — weave-side. agocraft 변경 0. |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-03 AskUserQuestion: 범위=「BI 10종 + Candlestick + Boxplot + Treemap + Sankey」, 인코딩=「타입드 채널 / 그래픽 문법」) |
| Status | **Accepted** (2026-06-03 — 선행 일반화 P1~P5 + **14종 전부 구현·검증 완료**(WI-079/080/081). 데이터 모델 무변경으로 타입 추가가 레지스트리 엔트리 1개임을 실증) |
| Decided on | 2026-06-03 |
| Triggering WI | [WI-079](../work-items/WI-079-generalized-chart-data-model.md) |
| Pairs with | FR-017 |
| Amends | DR-031(chart=dataset 참조), DR-035(encoding {category,values}) — 인코딩/데이터 포맷 일반화로 확장 |

## Context

현재 모델(DR-031/035)은 차트가 `datasetId` 로 데이터셋(root-unit 테이블)을 참조하고, `encoding = {category, values[]}` 로
컬럼을 **단 2개 역할**(축 라벨 / 값 시리즈)에 매핑한다. 이는 bar/line/pie 에만 맞고, 사용자가 추가하려는 14종
(레이더 포함)을 표현할 수 없다:

- **scatter/bubble** — x·y 가 둘 다 수치(measure), +size.
- **radar** — 여러 지표 축 × 시리즈.
- **heatmap** — x·y 둘 다 카테고리 + 셀 값.
- **candlestick** — 날짜 + 시가/고가/저가/종가(OHLC).
- **boxplot** — 카테고리 + 5요약(min/q1/median/q3/max).
- **treemap** — 계층(부모/자식) + 값.
- **sankey** — 흐름(source→target) + 값.

→ 14종을 추가하기 전에 **데이터 모델을 일반화하는 선행 작업**이 필요. FR-017 이 FEASIBLE 확인.

## 범위 — 14개 base 차트 타입 (variant 는 config)

| family | base types |
|---|---|
| cartesian | `bar`, `line`, `area`, `scatter`, `bubble`, `heatmap`, `candlestick`, `boxplot` |
| part-to-whole | `pie`(doughnut=variant), `funnel`, `gauge` |
| polar | `radar` |
| hierarchy | `treemap` |
| flow | `sankey` |

**variant(별도 타입 아님, config 플래그)**: `stacked`(누적), `normalized`(100%), `horizontal`(가로), `smooth`(곡선),
`innerRadius`(파이→도넛). → "10종"의 흔한 변형은 chartType 폭발 없이 `ChartAttrs.variant` 로 표현.

## Decision

### 1. 데이터셋 = **타입드 tidy 테이블** (포맷)

컬럼이 bare `string` → 타입을 가진 객체. 셀은 그대로 스칼라. 이것이 "포맷"의 핵심 — 각 컬럼이 자신의 데이터 타입을
선언해 차트가 처리 방식(카테고리 축 vs 값 축 vs 시간 축)을 안다.

```ts
type FieldType = "nominal" | "ordinal" | "quantitative" | "temporal";

interface DatasetColumn {
  readonly name: string;        // 안정 키 (셀은 name 으로 참조 — 컬럼 reorder 무관)
  readonly type: FieldType;     // 차트가 컬럼을 다루는 방식
  readonly format?: string;     // 선택: 파싱/표시 힌트 (예: "YYYY-MM", "0.0%")
}

type DatasetCell = string | number | boolean | null;   // temporal 은 ISO 문자열 또는 epoch
type DatasetRow  = Readonly<Record<string, DatasetCell>>;

interface DatasetPayload {
  readonly name: string;
  readonly columns: ReadonlyArray<DatasetColumn>;       // ← 기존 string[] 에서 변경
  readonly rows: ReadonlyArray<DatasetRow>;
}
```

- **tidy/long 우선, wide 허용**: 여러 시리즈는 (a) `series` 채널(long: 한 값 컬럼 + 그룹 컬럼) 또는 (b) 다중 `value`
  필드(wide: 시리즈마다 컬럼 — 현재 그리드 UX 와 일치) 둘 다 지원.
- **계층/그래프도 테이블**: treemap=`(id, parent, value)` 행, sankey=`(source, target, value)` 행(edge-list).
  별도 트리/그래프 자료구조 불필요 — 단일 테이블이 14종 모두 수용.

### 2. 인코딩 = **시각 채널 → 필드 매핑** (명칭)

`{category, values[]}` → 닫힌 채널 어휘. 각 채널은 컬럼을 `FieldRef` 로 참조(이름 기준 안정 키).

```ts
interface FieldRef {
  readonly field: string;          // 컬럼 name 참조
  readonly type?: FieldType;       // 이 인코딩에서만 컬럼 타입 override (드묾)
  readonly aggregate?: Aggregate;  // 후속: sum|mean|count|min|max|median
}
type Aggregate = "sum" | "mean" | "count" | "min" | "max" | "median";

interface ChartEncoding {
  // ── 차원 / 위치(positional) ──
  readonly category?: FieldRef;    // 단일 범주/시간 키 (bar/line/area/pie/funnel/radar/boxplot/treemap leaf)
  readonly x?: FieldRef;           // 위치 X (scatter/bubble=수치, heatmap=범주, candlestick=시간)
  readonly y?: FieldRef;           // 위치 Y (scatter/bubble=수치, heatmap=범주)
  readonly series?: FieldRef;      // 시리즈 분할 / 색 (long), 대부분 선택
  // ── 측정값(measure) ──
  readonly value?: FieldRef | ReadonlyArray<FieldRef>; // 크기. 배열=다중 시리즈(wide)
  readonly size?: FieldRef;        // 버블 반경 (quantitative)
  // ── 금융 (candlestick) ──
  readonly open?: FieldRef; readonly high?: FieldRef; readonly low?: FieldRef; readonly close?: FieldRef;
  // ── 통계 (boxplot, 사전집계 5요약) ──
  readonly lower?: FieldRef; readonly q1?: FieldRef; readonly median?: FieldRef; readonly q3?: FieldRef; readonly upper?: FieldRef;
  // ── 계층 (treemap) ──
  readonly id?: FieldRef; readonly parent?: FieldRef;
  // ── 흐름 (sankey) ──
  readonly source?: FieldRef; readonly target?: FieldRef;
}
```

**채널 명칭 규칙(학습 가능한 단일 규칙)**:
- **단일 범주 키 + 측정값** → `category` + `value`(현재 모델과 동일 → 마이그레이션 최소).
- **두 위치 차원 필요** → `x` + `y` (scatter/bubble=둘 다 수치, heatmap=둘 다 범주 + `value` 셀).
- `series` 는 어디서나 시리즈 분할(색). `value` 는 다중 필드로 wide 시리즈.
- 특수 측정값(OHLC / 5요약), 구조(id·parent / source·target)는 해당 family 전용 채널.

### 3. chartType → **ChartTypeSpec 레지스트리** (Rule 6)

기존 `BUILDERS: Record<ChartType, builder>` 를 **채널 스펙 + 빌더 + 메타**를 담는 풀 레지스트리로 확장. UI(인코딩 편집기)
와 렌더러가 **같은 레지스트리**를 읽는다 → 단일 소스. 차트 추가 = 엔트리 1개(+빌더 파일 1개), 기존 코드 무수정.

```ts
type ChartFamily = "cartesian" | "part-to-whole" | "polar" | "matrix" | "hierarchy" | "flow";

interface ChannelSlot {
  readonly channel: keyof ChartEncoding;
  readonly label: string;                       // UI 라벨: "값", "시작가", "지표", "원천"…
  readonly required: boolean;
  readonly multiple?: boolean;                  // value: 다중 필드(wide 시리즈) 허용
  readonly accepts: ReadonlyArray<FieldType>;   // 이 슬롯에 유효한 컬럼 타입(피커 필터)
}
interface ChartTypeSpec {
  readonly type: ChartType;
  readonly family: ChartFamily;
  readonly label: string;                       // "막대", "레이더", "산점도"…
  readonly channels: ReadonlyArray<ChannelSlot>;
  readonly buildOption: (input: ChartRenderInput) => EChartsOptionLike; // 기존 빌더 자리
  readonly echartsModules: ReadonlyArray<string>; // 이 타입이 use() 할 series 모듈(번들 관리)
}
const CHART_TYPE_REGISTRY: Readonly<Record<ChartType, ChartTypeSpec>>;
```

- **인코딩 편집기 UI**: `spec.channels` 를 순회하며 슬롯마다 필드 피커 1개 렌더(컬럼은 `accepts` 로 필터). 차트별 UI 분기 없음.
- **렌더러**: `CHART_TYPE_REGISTRY[type].buildOption(input)`. 라벨 투영(DR-035)도 family 별 레이아웃 어댑터로 동일 레지스트리에서 분기.

### 4. 14종 채널 맵 (스펙 테이블 — 구현/UI 의 정의)

| type | family | 필수 채널 | 선택 | ECharts series |
|---|---|---|---|---|
| bar | cartesian | category, value(multi) | series, (stacked/horizontal/normalized) | bar |
| line | cartesian | category, value(multi) | series, (smooth/stacked) | line |
| area | cartesian | category, value(multi) | series, (stacked/normalized/smooth) | line(areaStyle) |
| pie | part-to-whole | category, value | (innerRadius→doughnut) | pie |
| funnel | part-to-whole | category, value | — | funnel |
| gauge | part-to-whole | value | (max) | gauge |
| scatter | cartesian | x(quant), y(quant) | series | scatter |
| bubble | cartesian | x(quant), y(quant), size(quant) | series | scatter(symbolSize) |
| radar | polar | category(지표), value(multi) | series | radar |
| heatmap | matrix→cartesian | x(nom/ord), y(nom/ord), value(quant) | — | heatmap(+visualMap) |
| candlestick | cartesian | category(temporal), open, high, low, close | — | candlestick |
| boxplot | cartesian | category, lower, q1, median, q3, upper | — | boxplot |
| treemap | hierarchy | id, value | parent | treemap |
| sankey | flow | source, target, value | — | sankey |

(데이터→ECharts 변환은 모두 매핑 가능 — FR-017 §검증 참조: heatmap=`[xIdx,yIdx,v]`+visualMap, candlestick=`[o,c,l,h]`,
boxplot=`[low,q1,med,q3,high]`, treemap=id/parent→nested, sankey=nodes+links.)

### 5. ChartAttrs 변경

```ts
interface ChartAttrs {
  readonly frame: ItemFrame;
  readonly datasetId: string;
  readonly chartType: ChartType;            // 3종 → 14종 union
  readonly encoding: ChartEncoding;         // {category,values} → 채널 맵
  readonly variant?: ChartVariant;          // 신규: stacked/normalized/horizontal/smooth/innerRadius
  readonly palette?: ReadonlyArray<string>;
  readonly showLegend?: boolean;
  readonly showAxis?: boolean;
  readonly opacity?: number;
  readonly overrides?: ChartOverrides;      // 유지 (category 안정키)
}
```

## 마이그레이션 (하위호환 — 차트는 영속됨)

로드 시 마이그레이션(migrate-frame-only 와 동형, `onUnknown:"preserve"` round-trip):

1. **데이터셋 컬럼**: `string[]` → `DatasetColumn[]`. 타입 추론 `inferFieldType(rows, name)`: 모든 셀 number→quantitative,
   파싱가능 날짜→temporal, 그 외→nominal. (사용자가 그리드에서 후에 변경 가능.)
2. **인코딩**: `{category, values}` → `{ category:{field}, value: values.map(v=>({field:v})) }`. chartType bar/line/pie 불변.
3. **버전**: dataset/chart schemaVersion bump. 미지 컬럼/채널은 보존(round-trip 게이트로 검증).

## Consequences

- **신규 개념**: 컬럼 타입, 채널 인코딩, ChartTypeSpec 레지스트리(채널+빌더+모듈). 인코딩 편집 UI 가 데이터-주도(스펙 순회).
- **확장 비용 급감**: 차트 추가 = 레지스트리 엔트리 + 빌더 파일 1개. 기존 타입/호출부 무수정(Open-Closed).
- **번들**: ECharts series 모듈은 `spec.echartsModules` 로 **사용 타입만 lazy `use()`** → 14종을 다 켜도 실제 사용분만 청크 반영(트레이드오프: 동적 등록 1패스).
- **단일 진실원 유지**: 데이터=데이터셋(타입드), 인코딩=채널맵, 표현=overrides/variant. 경계 명확.
- **DR amend**: DR-031(chart=dataset) 유지·확장, DR-035(encoding {category,values}) → 채널맵으로 일반화(레이블 투영 DR-035 는 family 별 레이아웃으로 확장).

## SOLID/GRASP gate

- **Rule 6 (no switch on discriminant)**: chartType→`CHART_TYPE_REGISTRY`(어댑터 1개/타입, 파일 1개/빌더). 컬럼타입→축설정,
  family→레이블 레이아웃도 레지스트리. 인코딩 편집 UI 는 `spec.channels` 순회(차트별 분기 0).
- **단일 진실원 / 경계**: 데이터(타입드 테이블) · 인코딩(채널맵) · 표현(overrides/variant) 분리.
- **안정 키**: 인코딩은 컬럼 **이름**, overrides 는 **category 이름** 참조 — reorder/정렬/붙여넣기 견딤.
- **Open-Closed**: 신규 타입/채널/타입(FieldType) 추가가 기존 분기 수정 없이 가능.

## Dissent / 대안

- **풀 Vega-Lite 채널(theta/radius/color/shape…)**: 더 일반적이나 weave 의 "컬럼→역할" 패널 UX 엔 과함. → 채널을 14 family
  가 실제로 쓰는 닫힌 집합으로 한정(필요 시 추가).
- **aggregate(sum/mean) 내장**: 1차 범위 제외(boxplot 은 사전집계 입력). 후속 채널 `aggregate` 자리만 예약.
- **x/y vs category 통일**: scatter(둘 다 수치)·heatmap(둘 다 범주)만 x/y, 단일 범주 키는 category — 통일 대신 "위치 차원 수"
  기준의 학습가능 규칙 채택(현재 모델 마이그레이션 최소화 이득).

## Links

- [FR-017](../feasibility-reviews/FR-017-generalized-chart-data-model.md), [WI-079](../work-items/WI-079-generalized-chart-data-model.md), `features/chart-item/CHART_MODEL_GENERALIZATION.md`(plan)
- 관련: DR-031, DR-033, DR-035 / 구현 후보: `dataset/dataset-store.ts`(DatasetColumn 타입), `domains/chart/chart-types.ts`(신규 ChartTypeSpec 레지스트리), `echarts-option.ts`(빌더→레지스트리 이관), `migrate-chart-model.ts`(신규), 인코딩 편집기(`toolbar/sections/chart-section.tsx` 데이터-주도화)
