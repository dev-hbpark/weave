# Decision Record — DR-035 Interactive chart elements (hybrid: ECharts marks + real text items + per-element overrides)

## Metadata

| Field | Value |
|---|---|
| ID | DR-035 |
| Title | 차트를 ECharts 단일 leaf 에서 **하이브리드 인터랙티브 차트**로 확장한다: (a) 데이터 마크(막대/선/파이)는 ECharts 유지, (b) 축 레이블·범례·제목 텍스트는 **실제 weave `text` 아이템**(데이터셋이 단일 진실원, 텍스트 아이템은 파생 + 편집 위임), (c) 마크/시리즈를 **ECharts 이벤트로 클릭 선택** → 컨텍스트 편집(값=데이터, 색·두께·도넛오프셋·강조=표현 override), (d) **per-element 표현 override** 를 chart attrs 에 **안정 키(시리즈명/카테고리명)** 로 저장해 ECharts option 에 주입. 데이터(값·레이블)는 데이터셋 자동 동기화. 마크 자유 이동/회전은 비범위. |
| Decision Level | **1 Project-local** — weave-side. agocraft 변경 0(가능하면). |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-03 AskUserQuestion: 「B 하이브리드」 + 노트 "강조용 두께·색 변경, 도넛 원점 거리 등 디테일 조작") |
| Status | **Accepted** (아키텍처 채택; Phase A 구현·브라우저 검증 완료, B/C/D 후속) |
| Decided on | 2026-06-03 |
| Triggering WI | [WI-078](../work-items/WI-078-interactive-chart-elements.md) |
| Pairs with | FR-016 |
| Amends | DR-031(chart leaf→부분 컨테이너), DR-033(ECharts 가 텍스트 렌더→텍스트는 실제 아이템) |

## Context

DR-031/033/034 의 차트는 ECharts 가 전부 그리는 불투명 leaf. 사용자가 (1) 내부 텍스트를 실제 아이템으로,
(2) 시리즈/요소를 클릭해 디테일 조작(두께·색·도넛 오프셋), (3) 데이터 자동 반영을 요청. FR-016 이 B
하이브리드 범위를 **FEASIBLE WITH TRADE-OFFS** 로 확인.

## Decision (제안)

1. **데이터-바인딩 경계 (단일 진실원 규칙)**
   - 데이터 = 값, 카테고리 레이블 텍스트, 시리즈 이름 → **데이터셋**. 편집은 항상 `weave.dataset.update`
     로 라우팅(텍스트 아이템·핸들은 편집 위임 surface).
   - 표현 = 요소 색·두께(borderWidth)·도넛 오프셋/explode·강조 → **chart.attrs.overrides** (데이터셋에
     없음). 자유 위치/회전은 비범위.

2. **per-element override 모델** — `ChartAttrs.overrides` (신규, 선택):
   ```
   overrides?: {
     series?: Record<string /*열이름*/, { color?; borderWidth?; emphasis?:boolean }>;
     datum?:  Record<string /*카테고리명*/, { color?; offset?/*pie 원점거리*/ }>;
   }
   ```
   **dataIndex 가 아니라 시리즈명/카테고리명(안정 키)** 으로 저장 → 행 추가·정렬·붙여넣기에 견딤. option
   빌더가 `series.data[i].itemStyle` / `selectedOffset` 로 주입.

3. **텍스트 = 실제 weave text 아이템 (레이블 레이어)**
   - ECharts 자체 축/범례/제목 텍스트는 끄고, weave `text` 아이템을 레이블 위치에 배치.
   - **단일 진실원 = 데이터셋**: text 아이템 콘텐츠는 데이터셋에서 파생, 편집은 데이터셋 커맨드로 위임
     (이중 진실원 회피). 폰트·색 등 텍스트 표현은 weave 텍스트 아이템 속성(자연히 AI/툴 조작 가능).
   - 위치: ECharts `convertToPixel` 추종 또는 weave 가 차트 여백/축 영역을 통제해 직접 계산
     (Engineering Plan 에서 택1 — 정합성 위해 후자 우선 검토).

4. **요소 선택 = ECharts 이벤트** — `chart.on('click', p)` → `{componentType, seriesIndex, dataIndex}` →
   weave 선택 상태(마크를 weave 아이템화하지 않음) → 컨텍스트 편집 패널(값/색/두께/오프셋). 막대 높이
   드래그=value 는 후속.

5. **chart 컨테이너 여부 (sub-decision, EP 에서 확정)**
   - (A) chart 를 frame-like 컨테이너로 승격(레이블 text = 자식; container/drill/hover 의 `kind==="frame"`
     게이트 확장 필요) — 일관성↑·비용↑.
   - (B) 레이블 text 를 같은 frame 의 "링크된 형제"로(차트와 함께 이동/그룹) — 비용↓·결합 느슨.
   - 기본 방향: (A) 검토 우선, 비용 과대 시 (B).

데이터 모델(DR-031)·dataset(DR-034)·round-trip 불변. 마크 렌더는 ECharts(DR-033) 유지.

## Consequences

- **신규 개념**: per-element override(안정 키), 레이블 텍스트-아이템 레이어, ECharts 이벤트 선택 브릿지.
- **재생성 보존**: 데이터 변경 시 override 는 안정 키로 매칭 유지. 누락 키는 무시(graceful).
- **fragility**: 레이블 위치 추종 동기화(리사이즈/데이터 변경) — 지터 리스크, EP 에서 위치 전략 확정.
- **번들**: ECharts 청크 내 유지(추가 lib 없음). 선택/편집 UI 는 main(경량).
- **DR amend**: DR-033 "ECharts 가 텍스트 렌더" → 레이블은 weave 텍스트 아이템으로 일부 이관(마크는 유지).

## SOLID/GRASP gate (요약)

- Rule 6: override→ECharts option 주입은 per-속성 매퍼(switch 없음). 차트형별 레이블 위치는 chartType
  어댑터(echarts-option 의 registry 확장).
- 단일 진실원: 데이터=데이터셋, 표현=chart.overrides — 경계 명확히 분리(이중 진실원 금지).
- 안정 키: override/레이블 바인딩은 이름 기반(인덱스 금지) — 데이터그리드 편집과 비충돌.

## Dissent

C(완전 네이티브 frame-of-items)가 "전부 아이템" 이상엔 더 부합하나, 차트 엔진 재구현+override+재생성
충돌 비용이 과대 → 사용자가 B 하이브리드 명시 선택. 마크 자유 조작의 데이터 의미 미정의 문제는 B 에서
회피(제약 편집). 향후 C 수요 확인 시 별도 DR.

## Addendum (2026-06-03) — 최종 구현 설계 (Phase C 완료)

사용자 지시가 진행 중 수렴(2026-06-02~03): **"텍스트아이템만 사용 / 분리(promote)기능 제거 / ECharts 텍스트 숨김 / 그 영역에 텍스트 아이템 자동배치"**. 그리고 reconcile 방식은 **"바로 진행(방식 위임)"**. 이에 따라 위 제안의 일부가 다음과 같이 **확정/변경**됨.

### 변경된 결정

1. **레이블 = 실제 weave `text` 아이템 *전용*.** div 오버레이·promote/detach(텍스트 분리) 개념 전면 제거. ECharts 의 카테고리 축 텍스트는 숨기고(`echarts-option` 의 `axisLabel` off), 같은 영역에 weave `text` 자식을 **자동 배치**. NestedFrame 이 이미 `chart.children.filter(isDomainItem)` 를 재귀 렌더 → 차트가 실제 선택/편집 가능한 텍스트 자식을 보유(컨테이너 sub-decision 은 **A-lite**: `kind==="frame"` 게이트 확장 *불필요*).

2. **레이블은 NON-UNDOABLE, NON-SYNCED 파생 투영(projection).** ⭐ 이번 세션 핵심 엔지니어링 결정.
   - 레이블은 사용자 액션이 아니라 데이터셋의 *파생물*. `editor.exec`(History 기록) 로 만들면 두 가지가 깨짐:
     (a) 데이터 편집마다 추가 undo step, (b) **치명적 — 수렴형 컨트롤러가 undo 로 제거된 레이블을 즉시 재생성 → undo 가 레이블 레이어를 절대 통과 못 함(deadlock).**
   - 해결: 호스트에 `reconcileDerived(transform)` 추가(use-design.ts). 순수 변환 `projectAllChartLabels(doc)->doc` 를 적용하되 **History 와 ChangeStream/sync 를 모두 우회**. 변환이 drift 없을 때 *동일 doc 참조*를 반환 → 컨트롤러가 1패스 후 수렴(무한루프 없음).
   - 동기화: 레이블은 patch 로 전파되지 않음. 각 클라이언트가 동기화된 *데이터셋*에서 로컬 재생성 → 중복 생성/충돌 회피(분산 환경에서 올바른 모델). 영속화는 다음 실사용자 액션의 full-doc 저장에 편승, 로드 시 컨트롤러가 멱등 재조정.
   - 이는 CLAUDE.md "모든 변이는 editor.exec" 규칙의 *명시적 예외*(컨트롤러 소유 파생 아이템 한정). `reconcileDerived` 는 사용자-변이 채널이 아님.

3. **레이블 편집 → 데이터셋 라우팅(편집 위임).** 레이블 더블클릭 = 네이티브 텍스트 편집(툴바 아님). 커밋 시 DesignPage 의 `onUpdateItem` 가로채기: 아이템에 `chartLabelRef` 가 있고 `text` 가 바뀌면 `weave.dataset.update`(항목 셀 rename, **undoable 사용자 액션**) 로 라우팅. 그 후 컨트롤러가 레이블 텍스트를 데이터셋에서 재파생. 단일 진실원=데이터셋 유지.

4. **label-style override 제거(decommission).** 초안의 `overrides.label`/`ChartLabelStyle`/`setLabelOverride`/`labelOverride` + 폰트 전용 `chart-label-editor.tsx` + element-context 의 `role:"label"` 전면 삭제. 레이블 텍스트 표현(폰트/색/굵기)은 **텍스트 아이템 자체 속성**으로 처리(별도 override 불필요, 자연히 툴바/AI 조작 가능). **mark(datum) override 만 잔존**.

5. **pie 도 실-text-아이템 레이블로 투영 완료(2026-06-03).** ~~연기~~. 핵심: 차트 px **종횡비**(aspect)를
   **디자인 px 크기 × 차트 frame** 에서 도출 → 원(circle)을 ratio 공간의 타원으로 매핑해 순수 계산 가능.
   `chart-label-layout.ts:pieLabelLayout(categories, values, aspect)` 가 슬라이스 **값-가중 mid-angle**(top·시계,
   ECharts startAngle 90°)에 ratio 좌표 배치(반경 = min(px)의 0.42 → 70% 파이 밖). `desiredLabels` 가 pie 분기
   추가, `useChartLabelSync(reconcileDerived, doc, designW, designH)` 로 디자인 크기 주입(리사이즈 시 재배치).
   ECharts 자체 pie `label`/`labelLine` 는 `show:false`(중복 방지). bar/line 은 종횡비 무관(기존 유지). e2e:
   bar→pie 전환 시 동일 4 레이블이 바닥 행→원 둘레로 재배치 확인.

### 구현 위치

- `document/domains/chart/chart-label-sync.ts` — 순수 투영(`projectChartLabels`/`projectAllChartLabels`, `@agocraft/core` 의 `addChild`/`updateChild`/`removeChild` 사용, 결정적 id `${chartId}__chartlbl${row}`, drift 없으면 동일 참조 반환).
- `document/domains/chart/use-chart-label-sync.ts` — `useEffect([reconcileDerived, doc])` 로 투영 구동(수렴).
- `document/use-design.ts` — `reconcileDerived` (History/sync 우회 파생 setter).
- `pages/DesignPage.tsx` — `useChartLabelSync` 배선 + `onUpdateItem` 의 `chartLabelRef`→dataset 가로채기.
- `document/domains/ChartBlock.tsx` — div 레이블 제거된 thin shell(placeholder + lazy ECharts + mark-click 브릿지).

### 검증

- 단위 426 통과(decommission 후). 차트 e2e 8/8 통과 — undo 카운트 *고정*(레이블이 History 에 없으므로 사용자 액션 수만큼만 undo), 실-텍스트-아이템 레이블 더블클릭→데이터셋 동기화 브라우저 확인. history/text-item e2e 회귀 없음(`text-item:829 s-handle` 는 기존 실패, 무관).
- 빌드 OK: echarts 청크 분리(193KB gz), DatasetGrid 분리(13.85KB gz).

## Links

- [FR-016](../feasibility-reviews/FR-016-interactive-chart-elements.md), [WI-078](../work-items/WI-078-interactive-chart-elements.md), `features/chart-item/ENGINEERING_PLAN.md`
- 관련: DR-031, DR-033, DR-034 / 구현: `document/domains/chart/{chart-label-sync,use-chart-label-sync,echarts-option,chart-label-layout,chart-overrides}.ts`, `ChartBlock.tsx`, `use-design.ts`(`reconcileDerived`), `DesignPage.tsx`
