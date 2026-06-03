# WI-077 — Chart item (`chart` kind) + dataset 데이터 관리 아이템

Status: **Done** (Phase 1-7 완료 — 빌드+브라우저 검증, round-trip 무손실, 413 유닛 + chart e2e 3/3 green)
Owner: hbpark
Updated: 2026-06-02

## Problem

weave 에 차트 아이템이 없다. 차트는 qr(WI-058)과 같은 **data-driven 계열**(데이터=원천,
비주얼=파생)이나, qr 의 인라인 단일 문자열과 달리 **구조화된 표(category/series/value)** 를
가지며 "여러 차트가 한 데이터를 공유 / 한 곳 수정 시 전부 갱신"이라는 요구가 있다.

따라서 단순히 새 시각 primitive 를 추가하는 문제가 아니라, **데이터를 별도로 소유하는
"데이터 관리 아이템"(dataset)** 개념이 함께 필요하다. 캔버스 위 `chart` 는 비주얼만
담당하고 데이터는 `datasetId` 로 참조한다.

## Decision

DR-031 (chart kind + dataset store) + FR-015 (feasibility) 참조. 요지:

- **새 weave-local kind `chart`** (agocraft builtin 아님 — qr 동일 취급). `attrs.datasetId`
  로 데이터를 **참조**, 인라인 소유하지 않음. agocraft 변경/vendor bump **0**.
- **`dataset` 은 `DomainKind` 가 아니다.** `doc.root.units` 의 `dataset:<id>` unit 으로
  문서가 소유 — 비시각(캔버스 비렌더 / z-order 비참여 / selection 비대상). 선례:
  `style.provider` unit(테마 토큰)이 동일하게 root.units 에 거주 + round-trip.
- **참조 무결성은 관대(graceful)**: dangling/빈 `datasetId` → "데이터 없음" placeholder
  렌더(삭제 차단·cascade 금지). qr 빈 data placeholder 와 동일 철학. 선례: `targetId`
  (hotspot/hover)도 dangling 을 no-op 처리.
- **반응성은 별도 배선 0**: 불변 doc → ChangeStream → React 재렌더 경로가 chart 의
  `datasetId` 룩업을 매 렌더 수행 → `weave.dataset.update` 가 참조 chart 전부 자동 갱신.
- **렌더 라이브러리는 본 WI 에서 미확정** — `/evaluate-library` 로 visx vs Recharts 를
  3관문(ESM / `sideEffects:false` / no reflect-metadata)으로 별도 확정(자체 SVG 폴백도 후보).

v1 범위: bar / line / pie 3종, 단일 datasetId 참조, dataset 편집 패널(기본 표 입력),
에이전트 생성. 비범위: 멀티-데이터셋 조인, 실시간 외부 데이터 소스, 축/범례 고급 커스터마이즈,
대시보드 레이아웃, csv 임포트(후속).

## Model

**`ChartAttrs` (types.ts)**

`{ frame, datasetId:string, chartType:"bar"|"line"|"pie", encoding:{ category:string;
values:string[] }, palette?, showLegend?, showAxis?, opacity? }`
— `datasetId` dangling 허용. 매 렌더 `resolveDataset(doc, datasetId)` 룩업.

**`DatasetUnit` (root.units 의 `dataset:<id>`)**

`{ kind:"dataset", id, attrs:{ name:string, columns:string[], rows:Array<Record<string,
string|number>> } }` — 불투명 JSON, 무손실 round-trip. `ensureDatasets` 로 로드 보정.

## Edits

| Area | File |
|---|---|
| Kind | `document/types.ts` (DomainKind += "chart", `ChartAttrs`, `ItemAttrsByKind`) |
| Spec(단일 진실원) | `document/domain-kinds.ts` (SPECS `chart` 1엔트리: meta/renderer/defaultAttrs/`participatesInZorder`) |
| Renderer | `document/domains/ChartBlock.tsx` (dataset 룩업 → 차트 라이브러리/SVG; dangling → placeholder) |
| **Render gate** | `agocraft-mirror.ts` `isDomainItem` += `chart` ← 하드코딩 allowlist; 빠지면 doc 에 있어도 무음 미렌더(WI-058 gotcha) |
| Dataset 스토어 | `document/dataset/` (신규) — `DatasetUnit` 타입, `resolveDataset(doc,id)`, `ensureDatasets`(↔ `ensureStyleProvider`), `agocraft-mirror` 보정 경로 |
| Dataset 커맨드 | `document/commands.ts` — `weave.dataset.add` / `weave.dataset.update` / `weave.dataset.remove` (모두 Patch → History) |
| Chart 생성/수정 | 기존 `weave.item.add(kind:"chart")` / `weave.item.update(attrs)` 재사용 |
| UX(차트 패널) | `toolbar/sections/chart-section.tsx` (chartType/encoding/표현) + `index.ts` `register("chart", …)` |
| UX(데이터 패널) | dataset 편집 표 UI(chart 선택 시 "데이터셋 편집" 진입) — **design-system triage 대상** |
| Selection | `pages/design/hooks/use-selection-chrome-registry.ts` (chart VM) |
| Add-menu | DesignHeader/DesignPage add-menu "차트" + `IconChart` glyph |
| Chart 생성(1트랜잭션) | `commands.ts` `weave.chart.add` — 시드 dataset `unit.create` + chart `item.create` 를 한 트랜잭션으로. add-menu·에이전트 공용 |
| Agent | `features/aku/agent/weave-command-schemas.ts` (`weave.chart.add` + `weave.dataset.*` 스키마. **ITEM_KIND 엔 chart 미추가** — empty-placeholder footgun 회피, `weave.chart.add` 가 유일 생성 경로) |

## Acceptance

- add-menu "차트" → 시드 dataset + bar 차트 1개 생성, 데이터로부터 렌더.
- dataset 편집(표 값 변경) → 참조하는 **모든** chart 가 자동 갱신, Cmd+Z 원복.
- 같은 datasetId 를 가리키는 chart 2개가 한 데이터 공유 확인.
- dataset 삭제 → 참조 chart 가 "데이터 없음" placeholder(앱 크래시/무음 미렌더 없음).
- chartType bar↔line↔pie 전환이 같은 dataset 으로 동작.
- 저장→로드 round-trip 무손실(chart attrs + dataset unit), `onUnknown:preserve`.
- 에이전트가 `weave.chart.add` 로 차트 1-스텝 생성(시드 dataset 동반), `weave.dataset.*` 로 데이터 편집.

## Workflow trail

- Feasibility: [FR-015](../feasibility-reviews/FR-015-chart-item-and-dataset.md) — **FEASIBLE WITH TRADE-OFFS** → Confirmed.
- Decision: [DR-031](../decisions/DR-031-chart-kind-and-dataset-store.md) — **Accepted** (2026-06-02).
- Design review: [DR-design-029](../design-reviews/DR-design-029-chart-icon-and-section.md) — IconChart + ChartSection + dataset 패널.
- Engineering Plan: `features/chart-item/ENGINEERING_PLAN.md` (Phase 1–7 전부 DONE).

## Verification

- **Unit 413/413 green**: dataset 스토어/커맨드/변형 헬퍼, chart kind 레지스트리, chart 어댑터
  (bar/line/pie), `weave.chart.add`, 에이전트 스키마 계약, **round-trip(저장→로드) 무손실**.
- **e2e `chart-item.spec.ts` 3/3 (실 Chromium)**: 생성→렌더, chartType 전환, dataset 편집 reflow,
  dataset 삭제 placeholder, 데이터 패널 행/열 CRUD, Cmd+Z 전 구간. 회귀: contextual-toolbar 5/5 +
  history-item-lifecycle + add-menu 7/7 green.
- typecheck/biome 클린.
- **렌더 개정 (DR-033, 2026-06-02)**: 자체 SVG → **lazy ECharts(SVGRenderer)** 전환. 데이터 모델
  불변. echarts 가 별도 청크(193KB gz, 온디맨드)로 코드 스플리팅 — main 번들 0 영향. 자체 SVG 어댑터
  Decommission. e2e chart-item 3/3 재검증(echarts svg 마운트).
- **데이터 입력 편의 (DR-034, 2026-06-03)**: dataset 편집 패널 손수 `<table>` → **lazy react-data-grid**
  (셀 편집·키보드·드래그필·셀 복붙 내장) + **엑셀/시트 블록 붙여넣기→전체 교체(헤더 자동 감지)** 배선.
  순수 TSV 파서 + **앵커 붙여넣기**(`pasteTableAt` — 선택 셀부터 채우고 행/열 확장·나머지 보존,
  `onSelectedCellChange` 추적) `clipboard-import.test`(15). 그리드 별도 청크 13.8KB gz(+CSS 1.9KB),
  온디맨드. **React 18 호환 위해 `react-data-grid@7.0.0-beta.47` 핀**(latest beta.59 는 React 19 전용→
  크래시). 미사용된 `setCell` Decommission. e2e chart-item **4/4**: 그리드 마운트 + 블록 import reflow +
  앵커 붙여넣기 + undo.

## Gotcha (해소)

`isDomainItem`(agocraft-mirror.ts)은 WI-058 시절 하드코딩 allowlist 였으나 **AUDIT-005 에서
`KNOWN_DOMAIN_KINDS`(domain-kinds SPECS 파생) 로 레지스트리화**됨 → `chart` 를 SPECS 에 한 줄
추가하면 컬링 게이트가 자동 포함(별도 수정 불필요). `domain-kinds.chart.test` 가 이를 가드.
dataset 은 unit 이라 이 게이트와 무관.
