# WI-082 — 차트 ECharts 레이블·색 테마 적용 (treemap/sankey)

Status: **Done** (2026-06-03 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-03

## Problem

treemap/sankey 레이블을 다른 타입처럼 weave 텍스트-아이템으로 만들고 싶다는 요청.

## Technical Feasibility (프로브 결과)

라이브 ECharts 인스턴스에서 노드 위치 추출을 프로브:

- **sankey**: `getData().getItemLayout(i)` → 노드별 `{x,y,dx,dy}` + `getName(i)`. **추출 가능**. 단 텍스트-아이템
  레이블은 render→레이아웃 측정→재투영 **피드백-루프 인프라**가 필요(레이아웃이 렌더 후에야 나옴). 또 노드≠행이라
  편집 바인딩이 별도(노드명 rename).
- **treemap**: 타일 rect 레이아웃이 모델/트리 API로 **미노출**(가상 루트만 layout, 실제 타일은 `getLayout()`
  undefined; 재귀 traversal로도 미발견). 텍스트-아이템 레이블 **불가**(SVG 스크래핑은 매우 취약).

→ 사용자에게 보고. **결정: 둘 다 ECharts 자체 레이블 유지 + weave 테마 적용**(텍스트-아이템 아님, 피드백-루프 불필요).

## 구현

1. **테마 텍스트** (`echarts-renderer.tsx`): ECharts SVG 렌더러는 CSS 변수를 못 푸므로, 렌더 시 themed 컨테이너의
   **계산된 `fontFamily`/`color`를 읽어 `option.textStyle` 리터럴 주입**. 모든 ECharts 텍스트(레전드/축/노드 레이블/
   게이지/툴팁)가 weave 폰트·색을 따름. 테마 전환은 다음 데이터 편집 시 반영.
2. **팔레트 var 해석** (동): `option.color`/`visualMap.inRange.color` 의 `var(--token)` 를 `getPropertyValue` 로 리터럴
   해석. → 그동안 echarts가 못 풀던 weave 팔레트가 실제 색으로 렌더(sankey 노드 보라/핑크 등 모든 타입 색상 정상화).
3. **칠해진-면 레이블 흰색** (`echarts-option.ts`): treemap 타일·funnel 세그먼트 레이블은 대비 위해 `color:"#ffffff"`
   (배경-위 텍스트는 themed textStyle).
4. **treemap 단일 루트 unwrap** (동): 래핑 루트 1개면 그 자식을 top-level 타일로 펼침 → 의미 있는 타일이 색칠되어
   표시(기존엔 루트 컨테이너가 흰 타일 1개로 렌더되던 회귀 수정).

## Gate / 검증

- 유닛 **469 green** (funnel/treemap 흰 레이블 + treemap unwrap 데이터 검증 추가).
- e2e chart **12/12** (all-14-families 포함). 브라우저 스크린샷: sankey(팔레트색 노드+테마 레이블), treemap(색 타일+
  흰 레이블)로 가독·테마 확인. tsc/biome 클린, 빌드 OK.

## 한계 / 후속

- 텍스트-아이템 레이블(편집·선택)은 treemap 불가/sankey 고비용으로 **미채택**. 향후 sankey만 피드백-루프로 별도.
- 테마 전환 즉시반영 X(다음 렌더 때 반영) — 필요 시 theme observer 추가.

## Links

- [WI-081](../work-items/WI-081-remaining-chart-types.md), [DR-035](../decisions/DR-035-interactive-chart-elements.md)(텍스트-아이템 레이블 패턴), [DR-036](../decisions/DR-036-generalized-chart-data-model.md)
- 구현: `domains/chart/{echarts-renderer.tsx, echarts-option.ts}`
