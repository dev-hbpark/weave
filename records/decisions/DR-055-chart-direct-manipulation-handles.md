# DR-055 — 차트는 정적 렌더러, 인터랙션은 weave 소유 (직접조작 핸들 + 기하 브리지)

- **Date:** 2026-06-04 · **Status:** Accepted · **WI:** WI-092
- **Relates:** WI-078/DR-035 (차트 아이템·요소 선택), WI-088/DR-037 (시리즈/데이터 override 편집),
  WI-057/DR-024·DR-032 (poly vertex 핸들 = 본 패턴의 선례), WI-067/DR-032 (uniform handle-interaction pipeline),
  `chart-element-editor.tsx` (값 편집의 기존 `dataset.update`+`setCell` 경로 — 본 드래그가 재사용)

## Context

ECharts는 hover emphasis·tooltip·pointer cursor·datum select-explode 등 자체 인터랙션을 기본 제공한다. weave는
이를 **에디터의 1급 인터랙션 모델**(선택→바운드+핸들→직접조작→문서 변경→undo)로 흡수하고 싶다. 특히 막대의 특정
바를 선택하면 높이 핸들이 나오고, 드래그가 **시각 높이 + 실제 dataset 값**을 함께 바꿔야 한다.

근본 난점: 핸들은 SelectionLayer(차트 DOM 밖, `document.body`로 portal)가 그리는데, 바/포인트/슬라이스의 픽셀
위치는 **레이아웃된 echarts 인스턴스만** 안다. 게다가 캔버스는 `transform: scale()` 줌을 쓴다.

## Decision

### 1. ECharts = 정적 렌더러 (인터랙션 strip은 한 곳)

`buildChartOption`(단일 디스패처)에서 `withStaticInteraction`으로 모든 옵션을 후처리: `tooltip.show=false`,
시리즈마다 `emphasis.disabled=true`·`cursor:"default"`·`selectedMode:false`. 빌더(14종)는 손대지 않는다(Rule 6).

- **`silent`은 false 유지** → echarts `click`이 계속 발화. 클릭은 **선택 hit-test 프리미티브**로만 쓰고, 선택 상태·
  핸들·편집은 전부 weave가 소유. echarts가 이미 family별 정확한 마크 hit-test를 하므로, 3종 기하의 hit-test를
  weave가 재구현하는 것보다 견고하다. **트레이드오프**: "완전한 weave hit-test"는 아니지만, *상태가 있는* 모든
  인터랙션(선택/핸들/드래그/undo)은 weave 소유라는 목표는 충족.

### 2. 기하 브리지 (PURE 커널 + provider 레지스트리)

- 순수 수학(`chart-geometry.ts`)은 echarts-free → 빠른 유닛 테스트: container↔client zoom-aware 변환
  (`scale = rect.size / offset.size`), pie 섹터 레이아웃 + "커서 각도 → 이 datum 값" 역산
  (`v' = f·restTotal/(1−f)`, 다른 datum 고정).
- impure seam(`chart-geometry-provider.ts`) 하나만 echarts 인스턴스를 닫음. **family 디스패치는 레지스트리**
  (laid-out series.type → 어댑터): cartesian = `convertToPixel`/`convertFromPixel`, pie = 순수 각도. switch 없음.
- `EChartView`가 chartItemId로 provider를 스토어에 publish(`chart-geometry-store.ts`), resize/setOption에 invalidate.

### 3. 선택 상태 = 모듈 스토어 (단일 소스)

선택 datum/series를 `chart-element-store.ts`(구독 가능)로 올려, **비-React view-model**과 **React 툴바**가 같은
소스를 본다(`vertexSelection` 선례). 컨텍스트는 `useSyncExternalStore` 어댑터로 축소.

### 4. 핸들 = 종류별 목록 (value + bar-width), view-model + 기존 제스처/명령 재사용

provider는 `handles(ref): ChartHandleSpec[]` **목록**을 반환한다(단일 앵커 아님). family가 어떤 핸들을 줄지 결정:
bar = `[value(높이), bar-width(두께)]`, line/area = `[value]`, pie = `[sweep]`. 각 spec은 `kind`("value" |
"bar-width") + 앵커 + `valueAtClient`(드래그 중 fresh ctx 재독)를 가진다.

핸들의 **쓰기는 kind별 레지스트리**(Rule 6, view-model의 `APPLY_BY_KIND`): `value`→`weave.dataset.update`+setCell
(datum의 dataset 셀), `bar-width`→`weave.item.update {barWidth}`(차트 속성). 드래그 루프에 switch 없음.

`createChartElementViewModel`(itemKind "chart")은 프레임 chrome과 병합되어 선택 datum에 spec마다 핸들 버튼을 더한다.

- **위치**: `document.body`로 portal + rAF 추적. `position:fixed`를 그냥 쓰면 캔버스 transform이 containing block을
  만들어 좌표가 깨진다(검증 중 실제로 −99568px로 빗나감) → body로 portal해야 viewport(client) 좌표가 성립.
- **드래그**: `startHandleGesture("chart-value-drag")`(기존 drag FSM 재사용) → sink가 `valueAtClient`로 새 값 계산 →
  **`weave.dataset.update`+`setCell`**(툴바 값 편집과 *동일* 경로) → History 계약 충족. 60Hz는 `mergeKeyOf`(같은
  `unit.attrs#dataset` 타깃, 500ms 창)로 **자동 1 undo** — 별도 mergeKey 불필요.

## Alternatives 기각

- **echarts 클릭까지 weave가 hit-test**(transparent overlay + convertFromPixel): 3종 기하 hit-test 재구현 비용 대비
  이득 적음. echarts의 정확한 마크 테스트를 클릭 프리미티브로 재사용(위 트레이드오프).
- **핸들을 SelectionLayer freeform anchor로 배치**: poly처럼 가능하나, layout()이 layer 재렌더에만 호출돼 요소-선택
  변화에 즉시 반응 못 함. portal+rAF가 자기완결적이고 pan/zoom/데이터변경을 모두 추적.
- **pie radius 핸들을 datum 값에 매핑**: radius는 공유 프레젠테이션이라 datum 데이터 의미가 없음 → sweep(각도=비율=
  값)만 데이터 핸들. radius 핸들은 별도 kind로 분리해 **`variant.innerRadius`(도넛)** 를 쓴다(후속 2에서 구현).
- **pie "arc-radius" = 외경 vs 내경**: 외경(파이 크기 축소)은 프레임 내 whitespace라 효용 낮고, 내경(도넛)은 모델
  `variant.innerRadius`(미연결이던 죽은 필드)를 살리며 sweep(외곽)과 공간적으로 분리(내측 핸들)돼 혼동이 없다 →
  **내경(도넛)** 채택. 외경은 deferred.

### 5. 선택 계층 + 바운드 (후속 3)

두-레벨 선택: **차트 아이템 선택**(프레임 box) → **단일 datum(바) 선택**(흰 바운드 + 핸들). datum 선택은
`chartElementStore`(transient, 비-문서) 이고, 차트 아이템 선택은 agocraft itemSelection(문서 selection)이다.
둘은 직교하지만 **생명주기는 종속**: datum은 그 차트 아이템이 선택돼 있을 때만 의미가 있으므로 —

- 차트가 deselect/전환되면 `chartElementStore` 정리(selectedIds effect, `vertexSelection`와 동형).
- Escape는 **가장 깊은 레벨부터** (datum → vertex → item).
- 차트 빈 영역 클릭은 datum만 해제(차트는 유지) = "전체로 복귀". echarts `getZr().on("click")` 의 `!target` 로 감지
  (고수준 `chart.on("click")` 은 mark 에만 발화하므로 충돌 없음).

바운드는 bar 만(rect). 슬라이스/포인트는 비-rect라 핸들만. 색은 테마 accent 가 막대색과 겹칠 수 있어
**white + dark halo** 로 대비 확보(핸들이 accent 이므로 역할 분리).

**2단계 드릴(프레임과 동일)**: 내부 요소(바)는 **차트 아이템이 이미 선택된 뒤에만** 선택된다 — 1클릭=차트(부모),
2클릭=바(자식). 동작(이동/삭제 등)은 프레임 자식과 다르되, *드릴 인터랙션*은 동일하게 맞춤. 선택 판정은 reactive
훅이 아니라 **imperative**(`vm.itemSelection.state.get()`): ① ChartBlock 유닛이 SSR이라 `useSyncExternalStore`가
깨지는 것 회피, ② ECharts 직접 click 리스너가 React 위임 onClick보다 먼저 발화 → 클릭 시점에 pre-click 선택을
읽어 "첫 클릭은 부모"가 성립.

### 6. 막대별(per-bar) 두께 = custom series (후속 4)

echarts `barWidth`는 **시리즈 단위**라 표준 bar로는 막대 하나만 다른 너비를 못 준다. 결정: 두께를 **per-datum
override**(`ChartDatumStyle.barWidth`)로 저장하고, 단일-시리즈 bar에 그 override가 **하나라도 생기면** custom
series(`renderItem`로 rect 직접 그림)로 전환한다. override가 없으면 일반 bar series 유지 — 공통 경로의 색/값/집계
동작과 기존 테스트를 보존하고, 변수-너비가 필요할 때만 무거운 경로로 간다.

- 두께 핸들은 **단일-시리즈 bar**에서만(`singleBarChart`): 그룹 막대에서 한 칸만 넓히면 이웃과 겹쳐 의미가 없다.
- provider는 custom series에 `barWidth`가 없으므로 `barFracAt`(host가 live override에서 해석)로 핸들/바운드 위치를
  잡는다. `custom` series type을 cartesian family에 매핑(레지스트리 한 줄, switch 없음).
- **함정(브라우저 검증으로만 드러남)**: `CustomChart` 모듈을 `use()`에 등록하지 않으면 custom series가 *조용히 아무
  것도 안 그린다*(빈 차트). custom 데이터는 2D `[catIndex, value]` + `coordinateSystem:"cartesian2d"` 여야 높이가
  매핑된다(scalar면 납작). → e2e에 **렌더 가드**(실제 막대 폭/높이 측정)를 추가해 회귀를 자동 포착.

**두 레벨 두께(선택 계층과 일치)**: 차트(부모) 선택 → 전역 `attrs.barWidth`(모든 바, kind `global-bar-width`로 막대마다
핸들), 바(자식) 선택 → per-datum override(그 바만). **default + override** 모델 — 전역은 비파괴적(개별 override 유지).
provider가 `barWidthHandles()`로 막대별 전역 핸들을 enumerate(앵커/값 계산을 catIdx 기반 헬퍼로 per-bar 핸들과 공유).

## Consequences

- 새 마크 유형 추가 = `FAMILY_BY_SERIES_TYPE`에 어댑터 1줄(switch 없음). 새 핸들 거동 = sink 교체.
- 차트는 이제 hover 피드백이 없다(정적). 의도된 변화 — 선택/핸들이 어포던스를 대신한다.
- 값 쓰기는 기존 `setCell` 경로를 타므로 집계/long-format의 `rowIndex` 매핑 한계를 그대로 공유(공통 케이스 1:1).
