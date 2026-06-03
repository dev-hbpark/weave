# WI-078 — Interactive chart elements (real text items + selectable series + per-element overrides)

Status: **Done** (Phase A/B/C/D — 마크 클릭 편집 + 레이블=실제 text 아이템(비-undo 파생 투영, bar/line/**pie 전부**) + 행 삭제 + round-trip)
Owner: hbpark
Updated: 2026-06-03

> **최종 수렴(2026-06-03) — 아래 Phase C.1/C.2/C.3·D.2 로그는 *중간 설계*이며 다음으로 대체됨.** 사용자 최종
> 명세: "텍스트아이템만 사용 / 분리(promote)기능 제거 / ECharts 텍스트 숨김 / 영역에 텍스트 아이템 자동배치."
> 구현: 레이블은 **NON-UNDOABLE·NON-SYNCED 파생 투영**(컨트롤러 `useChartLabelSync`→호스트 `reconcileDerived`,
> `editor.exec` 아님). 이유: 수렴형 컨트롤러+undo 기록은 **undo deadlock**(undo 가 제거한 레이블을 컨트롤러가
> 즉시 재생성). 레이블 편집은 `chartLabelRef` 가로채기로 데이터셋에 라우팅(undoable). **decommission**: promote
> (`promotedLabels`)·label-style override(`ChartLabelStyle`/`setLabelOverride`/`overrides.label`)·`chart-label-editor.tsx`
> ·div 레이블·`pieLabels`·element-context `role:"label"` 전면 삭제. 상세 = **DR-035 Addendum(2026-06-03)**. 검증:
> 유닛 426 green, 차트 e2e 8/8(undo 카운트 고정), 빌드 청크 분리 유지.

## Problem

차트가 ECharts 가 전부 그리는 **불투명 leaf** 였다. 사용자는 (1) 내부 텍스트를 실제 weave 아이템으로,
(2) 막대/시리즈를 **클릭해 프레임 자식처럼 디테일 조작**(강조용 두께·색, 도넛 원점 거리), (3) 데이터
(값·레이블)는 **데이터셋 자동 반영**을 요청.

## Decision

FR-016 (FEASIBLE WITH TRADE-OFFS) + DR-035 (하이브리드) 참조. 요지:

- **B 하이브리드**(사용자 확정): 데이터 마크(막대/선/파이)는 ECharts 유지, 텍스트는 실제 아이템(후속),
  요소는 ECharts 이벤트로 클릭 선택.
- **바인딩 경계 — 단일 진실원**: 데이터(값·레이블·시리즈명)→데이터셋, 표현(색·두께·도넛오프셋·강조)→
  `chart.attrs.overrides`(**안정 키=카테고리명**). 마크 자유 이동/회전 비범위.

## Phases

- **Phase A** ✅ — per-element 표현 override + 요소 클릭 선택/편집.
- **Phase B** ✅ — weave-computed/rendered 카테고리 레이블 + 클릭 편집→데이터셋 동기화 (위치=weave 직접 계산).
- **Phase C** 🔶 진행 중 — ✅ 레이블→**자식 text Item 승격**(opt-out, free). ✅ **관리형 레이블의 텍스트아이템-수준 편집**(폰트 속성). 📋 양방향 재부착은 후속.

### Phase C 방향 정정 (사용자 명세, 2026-06-03)
사용자 정정: "echart 텍스트를 텍스트아이템 **수준**으로 대신 — **위치/이동은 echart(차트 레이아웃)를 따르되**,
선택·텍스트입력→데이터셋 동기화·**폰트 속성 적용** 등 메뉴 동작은 가능." → **기본 레이블은 관리형 위치**(자유
드래그 X) + **텍스트아이템 수준 편집**. C.1 의 자유 승격은 **명시적 opt-out("텍스트로 분리")**으로 유지.

### Phase C.3 — 레이블 더블클릭 인라인 편집 + 자동 동기화 ✅ (2026-06-03)
**사용자 정정**: "무조건 텍스트분리모드 — 더블클릭하면 바로 텍스트 에디팅, 툴바 입력 아님." + (앞서) 데이터
**자동 동기화**.
- **핵심 단순화**: 레이블은 데이터에서 **파생**되므로(관리형 위치·내용) **자동 동기화는 공짜**(데이터 변경→
  레이블 자동 반영). 별도 doc-tree 아이템 + reconcile 대공사 불필요.
- ChartBlock 레이블: **단일 클릭=선택(폰트 메뉴)**, **더블클릭=인라인 편집**(input, focus+select) → blur/Enter →
  `useDatasetCommit()`(DatasetContext 에 추가, editor-bound `setCell`)로 **데이터셋 카테고리 셀 커밋**. ESC 취소.
- 툴바 텍스트 입력 **제거**(`chart-label-editor` 는 이제 폰트 전용: 글꼴·색·크기·굵게·기울임). DatasetProvider 에
  `editor` 전달(DesignPage), PresentPage 는 미전달→no-op(읽기전용).
- e2e: 레이블 **더블클릭→인라인 편집→데이터셋 row0 동기화**+레이블 reflow. chart e2e **11/11**, 유닛 **446 green**.
- 위치는 여전히 레이아웃 관리(echart 따름). C.1 자유 승격은 opt-out 유지.

### Phase C.2 — 관리형 레이블 폰트 속성 ✅ (2026-06-03)
- `ChartLabelStyle` += `italic`/`fontFamily`. `FONT_FAMILY_PRESETS` 를 `toolbar/font-presets.ts` 로 추출(텍스트
  툴바와 공유, DRY). `chart-label-editor` 에 **글꼴 Select + 기울임 토글**(기존 색·크기·굵게에 더해) → 관리형
  레이블이 텍스트아이템 수준 폰트 편집을 가짐. 위치는 여전히 레이아웃 관리(자유 드래그 아님).
- 경계: 레이블 텍스트=데이터셋, 폰트 속성=chart override(label). e2e: 굵게+기울임→override 저장·렌더 반영·데이터
  불변. 유닛 `chart-overrides.test`(font family/italic merge/clear). chart e2e **11/11**, 유닛 **446 green**.

### Phase C.1 — 레이블을 실제 자식 text Item 으로 승격 ✅ (2026-06-03)
- **타당성 발견**: weave `NestedFrame` 이 `item.children.filter(isDomainItem)` 로 **frame 아닌 아이템(chart)
  의 자식도 재귀 렌더** → chart 가 text 자식을 가지면 렌더·선택됨(컨테이너 승격 가능, 최소 변경).
- `ChartAttrs.promotedLabels`(승격된 카테고리). `ChartLabelEditor` "텍스트로 분리" → `weave.item.add`
  (kind:text, **containerId=chartId**, 프레임=레이블 위치 ratio) + `weave.item.update`(promotedLabels).
  ChartBlock 은 승격된 카테고리의 managed 레이블 미렌더(중복 방지).
- 승격된 text 는 **진짜 weave 아이템**: chart 자식(프레임-상대 → 차트와 함께 이동), 선택·이동·스타일 가능.
  단 **free**(데이터셋 동기화 끊김 — 승격=분리 트레이드오프).
- **원자성**: 승격은 `editor.beginBatch()`…`endBatch()` 로 묶어 add+update 가 **한 트랜잭션**(Cmd+Z 1회로 전체 복원).
- **e2e(실 Chromium)**: 레이블 A "텍스트로 분리" → `text-block`("A") 렌더 확인(NestedFrame 재귀 입증),
  managed 레이블 사라짐, chart.children text 자식 + promotedLabels. **승격 text 를 `weave.item.update` 로 이동→
  렌더 유지(1급 아이템 입증)**, **Cmd+Z 1회로 승격 전체 복원**(managed 레이블 복귀·text 자식 제거). chart e2e
  **11/11**, 유닛 **445 green**.
- **Phase D** ✅ — 값-클릭 편집, 레이블 스타일 override, 파이 슬라이스 레이블(px 각도), **마크 삭제=행 삭제**, round-trip 검증.

### Phase D.1 — 마크 값 클릭 편집 ✅ (2026-06-03)
- `ChartClickInfo.dataIndex`(행 인덱스) + 렌더러 전달 → mark 선택 ref `rowIndex`.
- `ChartElementEditor` 에 "값" number input → `weave.dataset.update`(`setCell(rowIndex, valueColumn, raw)`).
  valueColumn = 클릭한 시리즈명 ?? 첫 값열. **데이터/표현 경계 준수**(값=데이터셋, 색/두께/오프셋=override).
- e2e: 막대 클릭→값 "200" → 데이터셋 value 셀 1개만 200, 차트 reflow.

### Phase D.2 — 레이블 스타일 override ✅ (2026-06-03)
- `types.ts` `ChartLabelStyle`(color/fontSize/bold) + `ChartOverrides.label`(카테고리명 키).
- `chart-overrides.ts` `setLabelOverride`/`labelOverride`(datum 과 공존 보존). `ChartBlock` 레이블 레이어가
  override 스타일 적용. `chart-label-editor` 에 색·크기·굵게 컨트롤 → `weave.item.update(overrides.label)`.
- **경계**: 레이블 텍스트=데이터셋, 레이블 스타일=chart override(이중 분리).
- e2e: 레이블 "A" 굵게 → `overrides.label.A.bold` 저장·데이터 불변·렌더 font-weight 700.

→ **요소별 디테일 편집 완성**: 마크(값·색·두께·도넛오프셋), 레이블(텍스트·색·크기·굵게) 모두 클릭 편집,
데이터는 데이터셋·표현은 override 로 자동 분리 동기화.

### Phase D.3 — 파이 슬라이스 레이블 + round-trip ✅ (2026-06-03)
- 파이는 px 원 기하 → `ChartBlock` ResizeObserver 로 px 측정, `pieLabels`(값 가중 mid-angle, top·clockwise =
  ECharts 기본 startAngle 90°)로 슬라이스별 weave 레이블 배치. bar/line 은 ratio 그대로(px 불필요).
  파이 레이블도 클릭→텍스트 편집→데이터셋 동기화.
- **round-trip 게이트**: `round-trip.test` — override(datum+label, 카테고리 안정키)가 저장→로드 무손실 보존.
- 가드: `chart-label-layout.test`(pieLabels 각도/가중/엣지) + round-trip override. chart e2e **9/9**(파이 레이블
  4개 렌더+편집 동기화), 유닛 **445 green**, 빌드 청크 분리 유지, typecheck/biome 클린.

## Phase B — 구현 (DR-035, 2026-06-03)

**범위 정직**: 완전한 독립 doc-tree text Item(차트 밖 드래그)은 컨테이너 모델(Phase C)이 필요한 대공사 →
Phase B 는 **weave 가 위치 직접 계산 + weave 텍스트로 렌더 + 클릭 편집→데이터셋 동기화**하는 레이블
레이어. ECharts 자체 카테고리 텍스트는 off, weave 가 소스.

| Area | File |
|---|---|
| 레이아웃(순수) | `domains/chart/chart-label-layout.ts` — `CHART_PLOT_MARGINS`(weave 소유 여백) + `categoryLabels`(bar 밴드중앙 / line 포인트, ratio 좌표·rowIndex) |
| ECharts 정렬 | `echarts-option.ts` — grid 를 `CHART_PLOT_MARGINS`(%) + `containLabel:false`, `xAxis.axisLabel.show:false`(weave 가 렌더), `boundaryGap`=bar |
| 레이블 레이어 | `ChartBlock.tsx` — `categoryLabels` → weave 텍스트 버튼(theme 토큰), echarts svg 위. 클릭 → `select({role:'label', rowIndex})` |
| 레이블 편집 | `toolbar/sections/chart-label-editor.tsx` — 텍스트 input → `weave.dataset.update`(`setCell` 으로 카테고리 셀 rename) |
| 동기화 헬퍼 | `dataset-store.ts` `setCell` 재추가(레이블→카테고리 셀) |
| 선택 ref | `chart-element-context.tsx` — `role:'mark'|'label'` + `rowIndex` 확장 |

**단일 진실원**: 레이블 = 데이터(카테고리) → 편집은 데이터셋으로 라우팅. 레이블 STYLE(폰트/색)은 후속.

## Acceptance (Phase B)

- 차트 카테고리 텍스트가 **weave 가 직접 위치 계산해 weave 텍스트로** 렌더(테마 반응).
- 레이블 클릭 → 편집기 → 텍스트 수정이 **데이터셋 카테고리 셀**에 반영, 차트·레이블 reflow.
- ECharts 자체 x축 레이블은 비표시(중복 없음); 막대/포인트가 weave 레이블과 정렬.

## Phase A — 구현 (DR-035)

| Area | File |
|---|---|
| Override 모델 | `types.ts` `ChartOverrides`/`ChartDatumStyle`(`color`/`borderWidth`/`offset`), `ChartAttrs.overrides?` |
| Option 주입 | `domains/chart/echarts-option.ts` — datum override → `series.data[i].itemStyle`(bar/line), pie `selected`+`selectedOffset` |
| 클릭 이벤트 | `domains/chart/echarts-renderer.tsx` — `chart.on('click')` → `ChartClickInfo{category,seriesName,value}` |
| 선택 브릿지 | `domains/chart/chart-element-context.tsx` — React context(ChartBlock publish → ChartSection 편집), DesignPage provider |
| 순수 override 헬퍼 | `domains/chart/chart-overrides.ts` — `setDatumOverride`(안정키 merge/clear/collapse), `datumOverride` |
| 편집 UI | `toolbar/sections/chart-element-editor.tsx`(색 ColorPicker + 두께 range + 도넛 거리 range + 해제) → `weave.item.update(attrs.overrides)` |
| 통합 | `chart-section.tsx` — 선택 요소가 이 차트면 Bar.Quick 에 편집기 노출; `ChartBlock` onElementClick 배선 |

**바인딩 경계 준수**: 편집기는 표현만(override→`weave.item.update`), 데이터는 안 건드림. 값 편집은 후속.

## Acceptance (Phase A)

- 막대/슬라이스 클릭 → 강조 편집기 노출, 색/두께/(파이)거리 조절이 차트에 반영.
- 조절값은 `chart.attrs.overrides.datum[카테고리]`(안정 키)에 저장 — 행 추가/정렬/붙여넣기 견딤.
- **데이터(값/행)는 불변**(표현 override 와 데이터 분리). Cmd+Z 로 override 되돌림.

## Verification (Phase A)

- 유닛: `chart-overrides.test`(8 — setDatumOverride merge/clear/collapse + bar/pie 주입), `echarts-option.test`,
  전체 **431 green**.
- **e2e `chart-item.spec.ts`(실 Chromium)**: 막대 클릭→강조 편집기→두께 override 저장, **데이터 불변** 확인.
  **막대 클릭이 ECharts 에 도달**(weave 선택 레이어 가로채기 없음) — 핵심 통합 리스크 해소. chart e2e 5/5.
- 빌드: echarts/DatasetGrid 청크 분리 유지. typecheck/biome 클린.

## Workflow trail

- Feasibility: [FR-016](../feasibility-reviews/FR-016-interactive-chart-elements.md).
- Decision: [DR-035](../decisions/DR-035-interactive-chart-elements.md).
- Engineering Plan: `features/chart-item/ENGINEERING_PLAN.md` § WI-078.

## 후속 (Phase B/C/D)

- 실제 text 아이템 레이블(데이터셋 동기화·위치 전략), chart 컨테이너 모델, 값-클릭 편집, 마크 삭제=행 삭제
  매핑, round-trip(override 안정키 보존) e2e.
