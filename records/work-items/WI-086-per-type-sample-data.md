# WI-086 — 타입별 샘플 데이터 시드 ("샘플 데이터" 버튼)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

WI-083 autoEncode 는 데이터셋이 새 타입에 *맞을 때* 자동 매핑하지만, 안 맞으면(예: 캔들=OHLC 필요, 산점도=수치 2개)
필수 채널 미충족 → placeholder. 14종을 UI 에서 바로 데모하려면 "맞는 데이터가 없을 때"의 경로가 필요.

## 구현

1. **샘플 정의** (`chart-samples.ts`) — 14종 각각의 **타입드 데이터셋 + 명시 인코딩**(`CHART_SAMPLES`).
   category/value · x/y(+size) · OHLC · 5요약 · id/parent · source/target · radar 다중값 등 family 별 실제 예시.
   shared(CATEGORY_VALUE/XY)로 중복 축소. `chartSample(type)` 조회.
2. **UI** (`chart-section.tsx`) — 차트가 **placeholder**(`!requiredChannelsSatisfied`)이고 단일 선택일 때 Bar.Quick 에
   "샘플 데이터" 버튼 노출. 클릭 → `editor.runBatch` 로 (a) 차트 자신의 데이터셋을 샘플로 교체 + (b) 인코딩 설정 →
   **한 번의 undo** 로 되돌림. 차트가 충족되면 버튼 사라짐(비-파괴: 자기 데이터셋만 교체).

## Gate / 검증

- 유닛 **481 green** — `chart-samples.test`: **모든 등록 타입(14)** 의 샘플이 (i) required 채널 충족, (ii) 인코딩 필드가
  실제 컬럼 참조, (iii) 행≥1 임을 일괄 검증.
- e2e chart **16/16** — 신규 `'샘플 데이터'`: bar→candlestick 전환 시 placeholder → 버튼 노출 → 클릭 → 렌더(비-placeholder)
  + 버튼 사라짐 + **Cmd+Z 1회로 복원**. 기존 회귀 0.
- tsc/biome 클린, 빌드 OK.

## Links

- [WI-083](../work-items/WI-083-chart-type-autoencode.md)(autoEncode), [WI-079](../work-items/WI-079-generalized-chart-data-model.md), [DR-036](../decisions/DR-036-generalized-chart-data-model.md)
- 구현: `domains/chart/chart-samples.ts`(신규), `toolbar/sections/chart-section.tsx`

## 후속 (선택)

번들 동적 모듈 등록(perf), per-field 집계.
