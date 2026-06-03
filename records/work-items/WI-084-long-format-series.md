# WI-084 — long-format `series` 채널 (그룹별 시리즈 분할)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

DR-036 가 설계한 `series` 채널이 미연결이었다. 그동안 cartesian 은 **wide 포맷**(시리즈마다 값 컬럼)만 지원 →
tidy/long 데이터(한 값 컬럼 + 그룹 컬럼, 예: (월, 지역, 매출))로 그룹별 시리즈를 그릴 수 없었다.

## 구현

1. **빌더** (`echarts-option.ts:cartesianOption`) — `series` 채널이 있으면 **LONG 포맷**: 값 컬럼 1개를 distinct
   `series`-컬럼 값마다 한 시리즈로 분할, x축 = **distinct 카테고리**. 없으면 기존 WIDE(값 컬럼=시리즈). `distinct` export.
2. **스펙** (`chart-types.ts`) — cartesian 채널에 `series`(선택, accepts CATS) 재추가 → spec-구동 UI 에 "계열(분할)"
   피커 자동 노출. `autoEncode` 는 **required 슬롯만** 자동 채움(선택 series 는 깜짝 그룹핑 방지 — opt-in).
3. **레이블** (`chart-label-sync.ts`) — LONG 포맷은 **distinct 카테고리**별 1 레이블(중복 행 아님). 바인딩은
   `chartLabelRef.rowIndices`(그 카테고리에 속한 **안정 행 인덱스 집합**).
4. **편집** (`dataset-store.ts:setCells` + DesignPage) — 레이블 편집 시 그룹의 모든 행 인덱스에 값 기록.
   - ⚠ **핵심 버그/수정**: 텍스트 편집은 **키스트로크마다** 커밋됨. rename-by-value(옛 값 키)는 "Q" 입력 후 1월→Q 가
     되면 다음 키스트로크의 옛 값 "1월"이 매칭 안 돼 "Q"만 남음. → **안정 행 인덱스**로 setCell 하면 키스트로크가
     같은 인덱스를 덮어써 최종값("Q1") 정상.

## Gate / 검증

- 유닛 **477 green** — 빌더 long-format(distinct 축 + 그룹별 시리즈), `setCells`(인덱스 기록/범위밖 무시), autoEncode
  (선택 슬롯 미채움).
- e2e chart **14/14** — 신규 `long-format series channel`: 4행 long 데이터→**2 distinct 레이블**(4개 아님)+svg 렌더,
  "1월" 레이블 더블클릭 편집→**그룹 양행 모두 Q1** + 레이블 재조정(2월,Q1). wide/pie/radar/auto-encode 회귀 0.
- tsc/biome 클린, 빌드 OK.

## Links

- [DR-036](../decisions/DR-036-generalized-chart-data-model.md), [WI-083](../work-items/WI-083-chart-type-autoencode.md), [DR-035](../decisions/DR-035-interactive-chart-elements.md)(레이블 투영)
- 구현: `domains/chart/{echarts-option,chart-types,chart-label-sync}.ts`, `dataset/dataset-store.ts`(setCells), `pages/DesignPage.tsx`

## 후속 (선택)

aggregate(sum/mean) transform(원시→집계), 타입별 샘플 데이터 시드, 번들 동적 모듈 등록.
