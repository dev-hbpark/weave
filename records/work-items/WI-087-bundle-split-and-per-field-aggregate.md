# WI-087 — echarts 번들 2-tier 분리 + per-field 집계

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

남은 후속 2건을 묶어 처리.

## 1. 번들 동적 모듈 등록 (core / advanced 2-tier)

**Problem**: lazy echarts 청크가 14종 모듈을 전부 정적 등록 → 242KB gz. bar 하나만 쓰는 디자인도 sankey/treemap
등을 다운로드.

**구현**:
- `echarts-renderer.tsx` 는 **CORE 모듈만 정적**(`use([Bar/Line/Pie + Grid/Legend/Tooltip + SVGRenderer])`).
  CORE_TYPES = {bar, line, area, pie}.
- `echarts-advanced.ts`(신규) — 나머지 10종 + VisualMap 모듈을 side-effect `use([...])` 로 등록. 렌더러가
  `import("./echarts-advanced.js")` 로 **동적 로드**(모듈-레벨 1회 promise 캐시).
- setOption effect: advanced 타입이면 `ensureAdvanced().then(apply)`(모듈 등록 후 렌더), core 면 즉시. cancelled 가드.

**결과**: 번들이 분리됨 — `echarts-renderer` **196KB gz**(was 242), `echarts-advanced` **49.75KB gz**(필요 시만).
common-chart 디자인은 ~50KB 덜 받음. advanced 타입은 첫 렌더 시 한 번 추가 로드.

## 2. per-field 집계

**Problem**: `FieldRef.aggregate` 는 필드별인데 빌더가 첫 필드 집계를 **모든 값 컬럼에 동일 적용**(모델 불일치).

**구현**: `aggregateRows` 가 **각 값 컬럼을 자기 FieldRef 의 `aggregate` 로** 집계(미지정 컬럼은 첫 집계로 fallback —
collapse 된 그룹은 원시 셀 못 가짐). 데이터 모델과 일치. (UI 의 단일 "집계" Select 는 유지 — 모든 필드 동일 설정;
필드별 UI 는 클러터 대비 가치 낮아 보류, 모델/빌더는 필드별 지원.)

## Gate / 검증

- 유닛 **482 green** — per-field 집계(매출 sum + 가격 mean 동시), 기존 aggregate/long-format 회귀 0.
- e2e chart **16/16** — `all 14 chart families render`(advanced 동적 로드 후 svg + "module not imported" 0 검증),
  radar/sankey/treemap/candlestick 등 advanced 타입 전환 정상. 빌드 청크 분리 확인.
- tsc/biome 클린.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md)(§Consequences 번들 전략), [WI-081](../work-items/WI-081-remaining-chart-types.md), [WI-085](../work-items/WI-085-value-aggregate.md)
- 구현: `domains/chart/{echarts-renderer.tsx, echarts-advanced.ts(신규), echarts-option.ts}`
