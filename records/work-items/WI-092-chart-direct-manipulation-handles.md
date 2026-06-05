# WI-092 — 차트 직접조작 핸들 (echarts 인터랙션 비활성 + weave 자체 핸들)

Status: **Done** (2026-06-04 — 구현·브라우저 검증 완료)
Owner: hbpark
Updated: 2026-06-04

## Problem

사용자: ECharts의 기본 인터랙션(hover emphasis·tooltip·pointer cursor)을 끄고, **weave 에디터 자체의
인터랙션**으로 처리하고 싶다. 시리즈/데이터를 선택하면 해당 UI 요소를 감싸는 바운드에 핸들을 놓고, 막대차트라면
특정 바를 선택했을 때 **높이 조정 핸들**이 보이고 그 핸들을 조작해 **높이 + 실제 데이터 수정**으로 이어지게 한다.

기존 WI-078/088(DR-035/037)에서 마크 클릭 → 요소 선택 + 속성/값 편집(툴바 숫자 입력)까지는 있었으나, 차트 위에
직접 얹히는 **드래그 핸들로 데이터를 조작**하는 경로는 없었다.

## Scope (사용자 확정)

- 대상: **Bar(높이) + Line/Area(포인트 Y) + Pie(스윕 각도)** 동시.
- ECharts UX: **정적 렌더러로 전환** — emphasis/tooltip/cursor/select-explode 전부 off. 선택·핸들·바운드·편집은
  전부 weave 소유. (클릭은 기존 echarts `click` 이벤트를 hit-test 프리미티브로 유지 — DR-055 § 트레이드오프.)

## Decision (DR-055)

기하 브리지 + 자체 선택 view-model + 드래그 제스처. 핵심 결정은 DR-055 참조.

## 구현

1. **정적 전환** (`echarts-option.ts:withStaticInteraction`, `chart-types.ts:buildChartOption`): 모든 빌더 결과를
   한 곳에서 후처리 — `tooltip:{show:false}`, 시리즈마다 `emphasis:{disabled:true}` · `cursor:"default"` ·
   `selectedMode:false`. `silent`은 false 유지(클릭=선택 hit-test). Rule 6: 빌더별 수정 없이 단일 strip.
2. **요소 선택 스토어** (`chart-element-store.ts`): 선택 datum/series를 구독 가능한 모듈 스토어로 승격
   (`vertexSelection` 패턴). React 컨텍스트(`chart-element-context.tsx`)는 `useSyncExternalStore` 어댑터로 축소 —
   비-React인 SelectionLayer view-model과 툴바가 **같은 소스**를 본다.
3. **기하 브리지**:
   - `chart-geometry.ts` (PURE, echarts-free): container↔client(zoom-aware) 변환 + pie 섹터 레이아웃/스윕→값 역산.
   - `chart-geometry-store.ts`: chartItemId → provider 레지스트리(구독 가능, resize/re-layout 시 invalidate).
   - `chart-geometry-provider.ts`: laid-out echarts 인스턴스를 닫아 family별 어댑터(레지스트리, switch 없음) —
     cartesian은 `convertToPixel`/`convertFromPixel`, pie는 순수 각도 수학. 시리즈 type을 옵션에서 읽어 디스패치
     (실제 그려진 것과 lockstep).
   - `echarts-renderer.tsx`: 마운트 시 provider를 스토어에 publish, resize/setOption 시 invalidate.
4. **선택 view-model** (`chart-element-view-model.tsx`, itemKind "chart"): 프레임 기본 chrome과 **병합**. 선택 datum에
   값 핸들 1개. `document.body`로 **portal**(캔버스 CSS-transform 컨테이닝 블록 회피) + rAF로 마크 추적
   (pan/zoom/데이터변경). pointerdown → `startHandleGesture("chart-value-drag")`; sink가 `valueAtClient`로 새 값
   계산 → `weave.dataset.update`+`setCell`(기존 값 편집과 동일 경로) → 60Hz 버스트는 `mergeKeyOf`로 1 undo.
   `use-selection-chrome-registry.ts`에 등록(라이브 datasetId/value 컬럼 바인딩).

## Gate / 검증

- 유닛 **548 green** — 신규 `chart-geometry.test.ts`(12: 좌표 변환 round-trip+zoom, pie 레이아웃/각도/스윕→값 역산),
  `echarts-option.test.ts`(+3: static strip), `handle-gesture-runner.test.ts`(레지스트리에 `chart-value-drag` 추가).
- e2e **`chart-value-handle.spec.ts` 2/2** — (1) 막대 선택→핸들 위로 드래그→데이터 셀 증가(30→상승)→Cmd+Z 1회로
  복원, (2) 파이 슬라이스→angular 스윕 핸들(ew-resize). 라이브 런타임 검증.
- 시각 확인: 핸들이 선택 바 top-center에 정확히 안착, hover tooltip/emphasis 없음(정적), 툴바 값 에디터 연동.
- tsc/biome 클린(신규 파일). declarativecheck/lint의 기존-baseline 실패(무관 파일 line drift)는 본 변경과 무관.

## 후속 1 — 막대 두께(barWidth) 측면 핸들 ✅ (2026-06-04, 이어서 구현)

사용자: 외곽선 두께(`borderWidth`)가 아니라 **바 자체의 두께**도 직접조작으로 조절. 선택한 막대 옆 모서리에 가로
핸들 → 드래그로 너비 조절. (echarts `barWidth`는 **시리즈 단위**라 차트 속성 = 모든 막대 함께 변경.)

- **모델** (`types.ts`): `ChartAttrs.barWidth?: number`(0..1, 카테고리 밴드 대비 비율). 빌더(`cartesianOption`)가
  bar에만 `barWidth:"<pct>%"` 적용. `ChartRenderInput`+`barWidth`, `ChartBlock`→`EChartView` 전달, 렌더러 `key`에 추가.
- **provider 일반화**: `handleAnchor/valueAtClient` 단일 → **`handles(ref): ChartHandleSpec[]`** 목록 반환. family가
  어떤 핸들을 줄지 결정 — bar = [value, **bar-width**], line/area = [value], pie = [sweep]. 각 spec의 `valueAtClient`는
  드래그 중 **fresh ctx**(최신 getBoundingClientRect) 재독.
- **width 기하**: 밴드폭 = 인접 카테고리 중심 간격(`convertToPixel`), 현재 두께 = laid-out `series.barWidth` 파싱
  (unset → 0.6). 앵커 = 바 오른쪽 모서리 세로중앙(axis "x"). drag → `frac = clamp(2·|cursorX−centerX|/band, .05, 1)`.
- **쓰기 전략 = kind별 레지스트리**(Rule 6, view-model): `value`→`dataset.update`+setCell, `bar-width`→
  `item.update {barWidth}`. 둘 다 `mergeKeyOf`로 1 undo. view-model이 spec마다 핸들 버튼 1개 portal 렌더
  (testid `chart-value-handle`/`chart-width-handle`, 모양 disc/pill).

검증: 유닛 **548 green**(+barWidth 빌더 3), e2e **3/3**(신규: 막대 측면 핸들 바깥 드래그 → `barWidth` 설정 →
Cmd+Z로 auto 복원). 시각: 막대 top 높이핸들 + 오른쪽 모서리 두께핸들 동시 표시.

## 후속 2 — 파이 inner-radius(도넛) 핸들 ✅ (2026-06-04, 이어서 구현)

사용자가 처음 고른 스코프("pie: **arc-radius** + sweep handle")에서 sweep만 했던 것을 완성. 파이 슬라이스 선택 시
sweep(외곽 호) 핸들 + **inner-radius(안쪽) 핸들**을 함께 표시. 안쪽 핸들을 중심에서 바깥으로 끌면 도넛 구멍이 열림.

부수 효과: `ChartVariant.innerRadius`(도넛)는 모델에만 있고 **렌더에 미연결**이었음 → 이번에 연결(죽은 기능 활성화).

- **렌더 연결** (`echarts-option.ts:pieOption`): `input.innerRadius>0` → `radius:[pct(inner·OUTER), pct(OUTER)]`,
  아니면 `pct(OUTER)`(솔리드). `PIE_OUTER_FRAC=0.7` 상수로 kernel `PIE_RADIUS_FRAC`와 lockstep(sweep 기하 불변).
  `ChartRenderInput`+`innerRadius`, `ChartBlock`이 `a.variant?.innerRadius` 전달, 렌더러 `key`+`innerRadius`.
- **기하** (`chart-geometry.ts:distanceFromCenter` + provider `pieInnerRadiusHandle`): 앵커=슬라이스 mid-angle,
  `grabR=max(현재innerFrac, 0.18)·outerR`(솔리드여도 중심 근처에서 잡힘). drag→`innerFrac=clamp(dist/outerR, 0, 0.9)`.
  현재 innerFrac은 laid-out `series.radius` 배열에서 파싱. axis "radial".
- **쓰기** (view-model `APPLY_BY_KIND["pie-inner-radius"]`): `item.update` **patch 형**으로 `variant.innerRadius` 병합
  (shallow `attrs` 병합은 형제 variant 플래그를 날리므로 patch로 prev.variant 보존). `mergeKeyOf`로 1 undo.

검증: 유닛 **554 green**(+pie radius 2, +distanceFromCenter 1), e2e **4/4**(신규: 안쪽 핸들 바깥 드래그 → 도넛
열림 → Cmd+Z로 솔리드 복원). 시각: innerRadius 0.5 도넛 + 슬라이스에 sweep·inner 핸들 동시.

## 후속 3 — 선택 계층(차트 전체 → 단일 바) + 선택 바운드 ✅ (2026-06-04, 이어서 구현)

사용자: 선택이 **차트선택(바 전체) → 바선택(단독)** 으로 모든 핸들링이 가능해야 함. 검증 결과 핸들 드래그는
동작했으나 (1) element 선택이 **deselect/Escape/아이템전환 시 정리 안 됨**(stale), (2) "차트로 돌아가기" 경로 없음,
(3) 원안 "해당 UI요소를 감싸는 **바운드**에 핸들 위치"의 바운드 미구현 — 셋 다 보완.

- **생명주기** (`DesignPage.tsx`, `vertexSelection` 패턴 미러): ① selectedIds에서 차트가 빠지면 `chartElementStore`
  정리하는 effect, ② Escape 계층화(바 → 정점 → 아이템, 가장 깊은 것부터), ③ echarts `getZr().on("click")` 빈
  영역 클릭 → `onBackgroundClick` → `select(null)`(차트는 선택 유지, 바만 해제 = 전체로 복귀). `ChartBlock`이 전달.
- **선택 바운드** (provider `bounds(ref)` + view-model `BoundOutline`): bar는 막대 픽셀 rect를 client 좌표로 반환
  (line/area·pie는 null). 선택 시 막대를 감싸는 흰색 윤곽(테마 accent가 막대색과 겹쳐도 대비되게 white+dark halo,
  pointer-events none) + 그 모서리에 높이/두께 핸들. handles+bounds는 한 rAF(`useChartChrome`)로 추적.

검증: 유닛 **554 green**, e2e **5/5** — 신규 **실제 클릭** 계층 테스트(차트 클릭→전체선택, 바 클릭→바운드+핸들,
빈영역 클릭→전체복귀, Escape→바해제, deselect→정리). 직전까지 element 선택을 프로그램 주입으로만 검증했던 공백을
실 클릭으로 메움. 시각: 막대 흰 바운드 + top 높이핸들 + 우측 두께핸들.

## 후속 4 — 막대별(per-bar) 두께: 선택한 바만 변경 ✅ (2026-06-04, 이어서 구현)

사용자: 바 하나를 선택해 두께를 바꾸면 **전체 바**가 바뀜. 원하는 건 **선택된 하나만** 바뀌고 나머지는 그대로.
원인: echarts `barWidth`는 **시리즈 단위** → 표준 bar series로는 막대별 너비가 불가능.

- **모델**: `ChartDatumStyle.barWidth?`(per-datum, 0..1). `chart-overrides.ts:cleanStyle`에 barWidth 보존 추가.
- **렌더**: 단일-시리즈 bar에 **per-datum 너비 override가 생기면** custom series(`type:"custom"` + `renderItem`)로
  전환해 막대를 직접 그림(`echarts-option.ts:customBarSeries`, `hasDatumBarWidth` 게이트). override 없으면 일반 bar
  유지(공통 경로·색/값 동작 보존). 일반 bar도 명시 `barWidth=globalFrac`로 그려 핸들이 실제 모서리에 안착.
- **쓰기**: 두께 핸들 `APPLY_BY_KIND["bar-width"]` → `attrs.barWidth`(전체)가 아니라
  `setDatumOverride(overrides, category, {barWidth})`(그 datum만). 두께 핸들은 단일-시리즈 bar에만 표시.
- **provider**: `custom`도 cartesian family로 매핑. `barFracAt`(EChartView가 live overrides에서 해석)로 핸들/바운드가
  선택 바의 실제 per-datum 너비를 추적. width/bound는 `singleBarChart`(bar-like 시리즈 정확히 1개)에서만.

**디버깅에서 잡은 두 버그(브라우저 검증으로만 드러남)**: ① `CustomChart` echarts 모듈 미등록 → custom series가
**아무 막대도 안 그림**(빈 차트). `echarts-renderer`의 `use([...])`에 `CustomChart` 추가. ② custom 데이터를 scalar
value로 주면 **높이 0(납작한 막대)** → 2D `[catIndex, value]` + `coordinateSystem:"cartesian2d"` 필요.

검증: 유닛 **561 green**, e2e **6/6** — 신규 (a) 두께 핸들이 **선택 바만** override(`only ["B"]`)·Cmd+Z 복원,
(b) **렌더 가드**: A(0.2)·B(0.95)·기본 → 실제 그려진 막대 폭이 narrow<default<wide(2배+)·높이>30(빈/납작 회귀
방지). 시각: B 굵게·D 얇게·A·C 기본, 높이 정상. build OK(CustomChart는 lazy echarts 청크 유지).

## 후속 5 — 부모→자식 2단계 드릴(프레임과 동일 UX) ✅ (2026-06-04, 이어서 구현)

사용자: 내부 요소 선택이 프레임처럼 **부모 선택 후 내부 요소를 선택하는 드릴**이어야 함. 확인 결과 바를 직접 클릭하면
**한 번에** 바가 선택됨(부모 단계 건너뜀). → 프레임 드릴(1클릭=컨테이너, 2클릭=자식 드릴)과 불일치.

- **게이트** (`ChartBlock.tsx`): 마크 클릭은 **차트 아이템이 이미 선택돼 있을 때만** 바를 선택. 첫 클릭은 버블된
  프레임 hit-test로 차트(부모)를 선택하고 끝 → 핸들 안 뜸. 두 번째 클릭에서 바로 드릴.
- **선택 읽기는 imperative**(`useContext(SelectionVmContext)` + `vm.itemSelection.state.get()`): reactive 훅
  (`useSelection`→`useEditorVM`의 `useSyncExternalStore`)은 SSR(ChartBlock 유닛은 `renderToStaticMarkup`)에서
  `getServerSnapshot` 없어 깨짐. imperative 읽기는 SSR-safe이고, **ECharts의 직접 click 리스너가 React 위임
  onClick보다 먼저** 발화하므로 클릭 시점엔 여전히 **pre-click 선택**을 본다(=드릴 성립).

검증: 유닛 **561 green**(ChartBlock SSR 테스트 통과), e2e **6/6** — 계층 테스트를 **2단계 드릴**로 갱신(바 직클릭
1회→차트만(핸들 0), 2회→바(핸들 1)). chart-item 17/17 무회귀(setSelection으로 차트 선택 후 클릭이라 게이트 통과).

## 후속 6 — 차트 레벨 전체 두께(부모 선택 시 모든 바 동시) ✅ (2026-06-04, 이어서 구현)

사용자: 차트(부모) 선택 → 두께 조절 = **모든 바 동시 동일**, 바(자식) 선택 → **그 바만**. 두 레벨 모델.
직전까지 바 레벨(per-datum)만 있었음 → 차트 레벨(전역) 절반 추가.

- **모델**: 차트 레벨 = `attrs.barWidth`(전역 기본값, 모든 바), 바 레벨 = `overrides.datum[].barWidth`(override가 전역
  덮음). default+override 모델(비파괴적 — 전역 조절이 개별 override 안 지움).
- **provider** `barWidthHandles()`: 단일-시리즈 bar에서 **막대마다** width 핸들 1개(전역). width 앵커/값 계산을
  `barWidthAnchorAt(catIdx)`/`barWidthFracAt(catIdx)`로 추출해 per-bar 핸들과 공유. 부수 수정: `datumValue`가 custom
  데이터 `[catIdx,v]` 배열에서 magnitude(마지막 원소)를 못 뽑던 잠재버그(핸들 Y가 baseline으로 빠짐) 수정.
- **view-model**: 새 kind `global-bar-width` → `attrs.barWidth` 씀. `ChartHandles`가 2모드 — datum 선택 시 그 바
  chrome, 아니면(차트만 선택) `useGlobalBarHandles`로 모든 바에 전역 핸들. `ApplyContext.ref`를 nullable로(전역은
  ref 불필요).

검증: 유닛 **565 green**, e2e **7/7** — 신규: 차트 선택 시 전역 핸들 4개(바 핸들 0), 하나 드래그→**전 막대 동일·축소**
(렌더 측정), `attrs.barWidth` 설정, Cmd+Z 복원. 시각: 4개 핸들 각 막대 우측, 드래그 시 전체 동시 변화.

### 후속 6.1 — 전역 핸들 호버 노출 ✅ (2026-06-04)

사용자: 전역 핸들 4개가 항상 보이면 산만 → **기본 숨김, 바 호버 시 그 바 핸들만** 노출.

- **호버 스토어** (`chart-hover-store.ts`): EChartView가 echarts `mouseover`/`mouseout`(60ms debounce) 브릿지 →
  `{chartItemId, rowIndex}`. `emphasis.disabled`여도 이벤트는 발화.
- **핸들 노출**: `HandleButton`에 `visible`(opacity 0 + pointerEvents none = 클릭 통과) + `onPin`. `GlobalWidthHandle`이
  `hovered===rowIndex || pinned`로 표시. 바→핸들로 이동 시 핸들 자체 `onPointerEnter`(+드래그 시작/종료)가 `pinned`로
  유지 → 사라지지 않음. spec에 `rowIndex` 추가로 호버 바 매칭. **드래그 종료** 콜백(`onEnd`)으로 pin 해제.
- 부수: 드릴인(datum) 핸들은 그대로 항상 표시 — 호버 게이트는 전역 핸들만.

검증: 유닛 **570 green**, e2e **7/7**(전역 테스트를 호버→노출→드래그로 갱신: 4 hidden → 바 호버 → 3 hidden).
시각: 차트 선택+바 C 호버 시 C 핸들만 노출(A/B/D 숨김).

## 후속 7 — 막대 색상도 선택 레벨에 따라 (전체/단일) ✅ (2026-06-04, 이어서 구현)

사용자: 두께와 같은 방식으로 **색상**도 — 차트 선택 시 전체 바, 바 선택 시 단일 바. 색은 드래그가 아니라 피커라
**툴바**에서 선택 상태에 따라 타겟이 바뀜.

- **단일 바** (드릴인): 기존 `ChartElementEditor`의 색 피커 → `overrides.datum[category].color`(그 바만). 이미 존재.
- **전체 바** (차트 선택, 바 미선택): `ChartSection`에 **"막대 색상"** 피커 추가 → `overrides.series[col].color`(모든 바).
  단일-시리즈 bar에서만 표시, datum 선택 시 숨김(요소 에디터와 비충돌). datum override가 series를 덮음
  (default+exception — 두께와 동일 형태). 렌더는 기존 경로(`seriesStyle`/`customBarSeries`가 series→datum 순서로 색
  적용)가 그대로 처리.

### 후속 7.1 — 색상을 모든 차트 타입으로 일반화 ✅ (2026-06-04)

사용자: 색상 2레벨을 **모든 타입** 차트에 동일 적용. 초기 구현은 bar 전용(`overrides.series` + `curType==="bar"` 게이트).

- **핵심 변경**: 차트 레벨 "전체 색상"을 bar 전용 `overrides.series[col]`가 아니라 **`attrs.palette = [color]`**(모든 빌더가
  cycle하는 **범용 색 소스**)로 씀 → **빌더 무수정**으로 bar/line/pie/radar/… 전 타입에서 모든 마크가 그 색.
  per-element override(datum/series)는 여전히 위에서 덮음(default+exception). 컨트롤 라벨 "막대 색상"→"색상",
  게이트 `curType==="bar"` 제거(전 타입, 요소 미선택 시 표시).
- per-element(단일) 색은 기존 `ChartElementEditor`가 이미 전 타입 지원 → 무변경.

검증: 유닛 **570 green**, e2e **8/8** — 갱신: 차트 선택 시 `chart-color` 표시(bar/line/pie 모두)·요소에디터 0 →
palette=빨강이 4바 모두 → 바 드릴인 시 숨김·요소에디터 1 → datum색=그 바만(나머지 palette색 유지). 브라우저
확인: bar 막대·pie 슬라이스·line stroke 모두 palette 색 적용, pie 슬라이스 per-datum override 우선. chart-item 17/17.

## 후속 (deferred)

- pie **외경(outer radius) 핸들**: 프레임 내 파이 크기 축소 — 흔히 whitespace라 보류. inner(도넛)만 구현.
- 전체 바 색상은 단일-시리즈 bar만(다중-시리즈는 범례 선택으로 시리즈별).
- 전역 두께 조절은 **비파괴적**(개별 override 유지) — "전부 리셋해 동일하게"는 별도 액션(미구현).
- pie/line 선택 바운드: 슬라이스(부채꼴)·포인트는 rect가 아니라 보류 — 핸들만(bar만 rect 바운드).
- **그룹(다중 시리즈) 막대의 per-bar 두께**: 슬롯이 겹쳐 의미 약함 → 단일-시리즈만 지원.
- **가로 막대(variant.horizontal)**: 높이·두께 핸들은 세로 막대 가정 — 가로는 축 반전 필요(후속).
- 집계(aggregate)/long-format에서 `rowIndex`→dataset row 매핑은 기존 값 에디터와 동일 한계 유지(공통 케이스 1:1).
- pan 중 핸들 추적은 rAF로 충분하나, 장기적으로 viewport 스토어 구독으로 대체 가능.
