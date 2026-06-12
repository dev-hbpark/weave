# WI-192 — 차트 조작 전수조사 + gauge 직접조작 핸들 + 모드/레이아웃 매트릭스 e2e

- 상태: DONE (2026-06-12)
- 출처: "프레젠테이션 모드와 믹스드 모드 두 모드에서 차트아이템의 모든
  타입에 대해 세부 속성을 조작하는데 문제가 없는지 전수조사 … 메뉴·핸들·
  포인터이벤트 등 사용자 UX와 에이전트 명령 모두 … 중첩 프레임과 다양한
  flex/grid 레이아웃 안에 삽입된 상황도 테스트"
- 결정: DR-126 (어느 타입에 datum 직접조작 핸들을 주는가)
- 선행: WI-077/078 (차트 아이템 + element 편집기), WI-092 (bar/line/pie
  직접조작 핸들 + geometry provider), WI-166/DR-114 (EditorModeContext —
  mixed vs slide-deck), WI-180 (모드-스코프 컨테이너; sandbox e2e)
- WI 번호: WI-190/191 선점(동시 세션 landing-multiselect는 WI-190 미커밋,
  WI-191 커밋됨) → committed-wins로 WI-192 채택.

## 1. 전수조사 (audit)

매트릭스 = **차트 타입(14) × 에디터 모드(mixed / slide-deck) × 조작 표면
(툴바패널 / element-클릭 편집기 / 캔버스 핸들 / resize·rotate / 에이전트
명령) × 중첩 컨텍스트(루트 / 중첩 프레임 / flex / grid)**.

### 구조적으로 정합 (코드 근거)

| 항목 | 근거 |
|---|---|
| 레이아웃 위치 | layout 엔진이 자식 frame을 **패치로 문서에 materialize** (`layout/registry.ts`, `commands.ts` onChildAdd/onFrameChanged/onReparent/onParentResize) → NestedFrame은 정합된 frame 비율을 렌더 |
| 차트 핸들 좌표 | `chart-geometry-provider.ts`가 `getBoundingClientRect()`로 실제 렌더 박스 라이브 측정 + 줌 보정 → 레이아웃이 박스를 바꿔도 매 프레임 재측정 |
| 핸들 제스처 dispatch | `FrameStage.tsx` `onDown`이 캡처단계 `[data-handle-kind]` DOM 마커로 해석 → page-bounded frame-move보다 먼저 가로챔. 게이트는 `frameDragAllowed`(두 모드 동일 STANDARD_INPUT FSM)뿐 → 모드 독립 |
| resize/rotate 레이아웃 필터 | `layout-constraint-filter.ts`가 flex/grid 소유 축 핸들 제거 |
| element 클릭 선택 | `markSelection`이 **전 family 커버 레지스트리** — 14종 전부 datum/series ref(`rowIndex`) |
| element 편집기 | dataset/overrides 대상 → 컨테이너 독립 |
| 에이전트 명령 | `weave.item.update`(chart attrs deep-merge)/`weave.dataset.*`는 slide-deck passthrough, `weave.chart.add`는 active-page clamp 래핑 |

→ **확정 버그 없음.** 위치·핸들좌표·제스처·에이전트 표면은 두 모드 +
중첩/레이아웃에서 구조적으로 정합. 차트 유닛 121건 green(기준선).

### 확정 갭

1. **[설계 비대칭]** 직접조작 드래그 핸들이 `FAMILY_BY_SERIES_TYPE`의 4
   series-type(bar/line·area/custom/pie)에만 존재. 나머지 10종은
   `familyFor → null → handles()=[]` → 캔버스 datum 드래그 핸들 없음(패널/
   element-편집기로만 조작). 의도/갭 여부의 **결정 기록 부재**.
2. **[검증 공백]** e2e/통합 테스트가 전부 `mixed`에서만 실행 — slide-deck ×
   차트 0건.
3. **[검증 공백]** 중첩 프레임 / flex / grid 안 차트 테스트 0건.
4. **[잠재]** 다성분 타입(candlestick OHLC·boxplot 5수·scatter x,y)의
   element 값 편집은 단일 셀만 써 부분편집.

## 2. 해결

- **갭①**: gauge 직접조작 값 핸들 추가(DR-126). 순수 각도 커널
  `gaugeLayout/gaugeFracForValue/gaugeAngleForValue/pointOnGauge/
  gaugeValueFromPoint`를 `chart-geometry.ts`에 추가(ECharts gauge 기본값
  225°→−45°, radius 75%와 lockstep). `chart-geometry-provider.ts`에
  `gaugeGeometry` FamilyGeometry 어댑터 + `FAMILY_BY_SERIES_TYPE.gauge`
  레지스트리 row. **기존 `kind:"value"` 재사용** → view-model/APPLY_BY_KIND/
  레지스트리 변경 0(setCell 경로 동일).
- **갭②③ (+ 갭①)**: `e2e/chart-mode-layout-matrix.spec.ts` 신설 —
  slide-deck 값핸들 드래그·중첩 프레임·flex·grid·gauge 각도핸들 5케이스.
  핸들이 타겟 차트의 렌더 박스 위에 앉는지(레이아웃 추종) + 드래그가 바인딩
  셀을 바꾸고 Cmd+Z가 1스텝으로 되돌리는지 검증.
- **갭①(나머지 9종)·갭④**: DR-126에서 패널전용/보류로 근거와 함께 확정.

## 3. 검증 (Continuous Self-Verification)

- 유닛: `chart-geometry.test.ts` gauge 커널 8건 추가 → 차트 유닛 **129건
  green**. `tsc --noEmit` 0 에러.
- e2e (라이브 런타임, dev :5179): `chart-mode-layout-matrix` **5/5 green**
  (slide-deck·nested·flex·grid·gauge). 기존 `chart-value-handle` 11건 +
  `chart-item` 회귀 확인.
- ⚠️ `chart-item.spec WI-081`(14종 일괄 렌더)은 **본 변경과 무관한 선재
  실패** — git stash로 변경 되돌린 클린 코드에서도 동일 실패. 원인은
  ECharts 라이브러리 내부(`FunnelPiece.updateData` 'points' / Candlestick
  `resolveNormalBoxClipping` 'ends')의 vite-deps dev 빌드 렌더 오류. 별도
  추적 대상(본 WI 비귀속).

## 4. 산출물

- 코드: `chart-geometry.ts`(gauge 커널), `chart-geometry-provider.ts`(어댑터
  + 레지스트리 row + 루즈 series 타입에 min/max).
- 테스트: `chart-geometry.test.ts`(+8), `e2e/chart-mode-layout-matrix.spec.ts`(신규 5).
- 기록: 본 WI, DR-126.

## 5. 후속 (DR-126 보류분)

- scatter/bubble 2D 포인트 드래그(2-셀 쓰기용 신규 handle kind) — 후속 WI.
- radar 정점 반경 드래그(ECharts radar convert 신뢰성 선검증) — 후속 WI.
- funnel 세그먼트 값(sort:descending 재정렬 + convert 부재 레이아웃 복제) —
  보류.
