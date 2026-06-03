# WI-083 — 차트 타입 전환 시 자동 인코딩

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

14종을 추가했지만 타입을 전환하면 인코딩이 새 타입에 안 맞아 차트가 **placeholder로 깨졌다**(예: 막대 데이터에서
"산점도" 선택 → x/y 미설정 → 빈 차트). 14종을 UI에서 실제로 쓰려면 전환이 매끄러워야 함.

## Decision / 구현

P1 타입드 컬럼 + P3 채널 스펙을 활용해 **타입 전환 시 데이터셋 컬럼에서 새 타입의 채널을 자동 매핑**:

- `chart-types.ts:autoEncode(type, columns, prev?)` — 각 채널 슬롯에 대해 (1) **이전 바인딩이 여전히 유효**(컬럼 존재 +
  타입이 slot.accepts 에 포함)하면 보존, (2) 아니면 **accepts 에 맞는 첫 미사용 컬럼 자동 선택**. 후보 없는 required
  슬롯은 미바인딩(→ graceful placeholder). `multiple` 슬롯은 유효 prev 다중 보존.
- `chart-section.tsx:setChartType` — 전환 시 `autoEncode(v, columns, enc0)` 로 `chartType` + `encoding` 동시 설정.
  호환되는 매핑(bar↔line 의 category+value)은 보존, 새 채널(→scatter 의 x/y)은 자동 채움.

## Gate / 검증

- 유닛 **474 green** — `autoEncode` 케이스(scatter=첫 2 quant→x/y, bar=category+value, prev 보존, candlestick=
  category+OHLC 별개 컬럼, 후보 부족 시 미바인딩→requiredChannelsSatisfied false).
- e2e chart **13/13** — 신규 `switching chart type auto-encodes`: 2 quant 컬럼 데이터셋에서 **UI 타입 피커로 산점도 선택**
  → data-chart-type=scatter + 비-placeholder svg 렌더 + encoding.x/y 자동 매핑(키/몸무게) 검증.
- tsc/biome 클린, 빌드 OK.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [WI-079](../work-items/WI-079-generalized-chart-data-model.md), [WI-081](../work-items/WI-081-remaining-chart-types.md)
- 구현: `domains/chart/chart-types.ts`(autoEncode), `toolbar/sections/chart-section.tsx`(setChartType)

## 후속 (선택)

long-format `series` 채널 + aggregate transform, 타입별 샘플 데이터 시드, 번들 동적 모듈 등록.
