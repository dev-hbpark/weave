# Engineering Plan — Chart item `chart` + dataset 데이터 스토어 (WI-077 / DR-031 / FR-015)

## Scope

차트를 새 weave-local kind `chart` 로 추가하되, 데이터는 **chart 가 인라인 소유하지 않고**
비시각 **dataset 데이터 스토어**(`doc.root.units` 의 `dataset:<id>` unit)가 소유하고 chart 는
`attrs.datasetId` 로 **참조**한다. 여러 chart 가 한 dataset 을 공유하며 dataset 수정은 참조
chart 전부를 자동 재렌더한다. **agocraft 변경 0, vendor bump 0** (attrs/Unit 불투명 — qr 선례).

**게이트:** (1) chart attrs + dataset unit round-trip 무손실, (2) dangling datasetId graceful
placeholder, (3) 데이터 수정 → 참조 chart 자동 갱신.

Out of scope (후속): 멀티-데이터셋 조인, 실시간 외부 소스, csv 임포트, 대시보드 레이아웃,
축/범례 고급 커스터마이즈. 렌더 라이브러리 확정은 **이 플랜과 독립**(`/evaluate-library`).

## Architecture (target)

- **dataset 스토어** (`document/dataset/`): `DatasetUnit { kind:"dataset", id, attrs:{ name,
  columns, rows } }` 가 `doc.root.units` 에 거주. `ensureDatasets(doc)` 가 로드/생성 보정
  (↔ `agocraft-mirror.ts` `ensureStyleProvider`/`buildRootStyleProviderUnit` 형제 패턴).
  `resolveDataset(doc, id): DatasetUnit | undefined` 단일 룩업 헬퍼(참조 무결성 중앙화).
- **chart kind** (qr 동형, weave-side 완결): `DomainKind += "chart"`; `ChartAttrs { frame,
  datasetId, chartType, encoding, palette?, showLegend?, showAxis?, opacity? }`;
  `domain-kinds.ts` SPECS 1엔트리; `ChartBlock` 렌더(`resolveDataset` → 라이브러리/SVG;
  dangling → placeholder). `isDomainItem`(agocraft-mirror) += `chart`.
- **커맨드**: `weave.dataset.add/update/remove` (Patch → ChangeStream → History). chart
  자체는 기존 `weave.item.add`/`weave.item.update` 재사용.
- **반응성**: 별도 구독 없음 — 불변 doc 스냅샷을 매 렌더 읽는 ChartBlock 이 `datasetId`
  룩업 → dataset unit 변경 시 자동 갱신.
- **분기 정책(Rule 6)**: `chartType`(bar/line/pie) 분기는 **차트형 registry/adapter**(1형=1어댑터),
  switch 금지. 새 차트형 = 어댑터 등록, ChartBlock 무수정.

## Phases (순차, 각 단계 typecheck + declarative + e2e 가드 / Continuous Self-Verification)

### Phase 0 — 선행 게이트
- `/solid-grasp` 스킬로 참조 레지스트리 경계(dataset 스토어 ↔ chart 참조 ↔ chartType 어댑터)
  1차 필터, 결과를 본 플랜에 임베드.
- design-system triage: ChartBlock 렌더 표면 + dataset 편집 표 패널 → `records/design-reviews/
  DR-design-<NNN>-chart.md` (신규 시각 primitive + 신규 패널 표면).
- `/evaluate-library`(병렬, 비차단): visx vs Recharts vs 자체 SVG 3관문 비교 → 렌더 백엔드 확정.
  미확정 시 Phase 3 는 자체 SVG(bar)로 선행 가능.

### Phase 1 — dataset 데이터 스토어 (비시각, 커맨드) — ✅ DONE (2026-06-02)
- `document/dataset/dataset-store.ts`: `DATASET_UNIT_KIND`, `DatasetPayload`/`DatasetRow`,
  `buildDatasetUnit`, `readDatasetPayload`, `findDatasetUnit`, **`resolveDataset`**(단일 룩업·dangling
  graceful), `listDatasets`, `normalizeDatasetPayload`, `nextDatasetId`.
- 커맨드(`commands.ts`, `buildWeaveCommands` 등록): `weave.dataset.add`(새 id 반환, `unit.create` on
  `root.id`) / `weave.dataset.update`(`unit.attrs` path `["dataset"]` 전체 교체) /
  `weave.dataset.remove`(`unit.remove`). 전부 self-contained Patch → History. 에러코드
  `duplicate-id`/`dataset-not-found`/`missing-dataset`/`invalid-input`.
- **설계 확정**: dataset 은 root.units 의 unit(=`style.provider` 선례). `mapItemDeep` 이 root 자신을
  매칭하므로 `root.id` 타겟 unit 패치가 root.units 에 동작함을 agocraft 소스에서 검증. `ensureDatasets`
  는 **불필요로 판명**(style.provider 와 달리 dataset 은 필수 선재가 아님 — 온디맨드 생성, 로드 시
  unit 자동 보존)하여 제외 — 대신 `resolveDataset`/`listDataset` read 헬퍼로 대체.
- 가드 결과: `dataset-store.test`(7) + `dataset-commands.test`(11) green; add/update/remove **forward +
  undo**(unit.create⁻¹/attrs swap/remove⁻¹) + reactivity(resolveDataset 가 update 반영) + 에러케이스.
  전체 스위트 **375/375 green**, typecheck/biome 클린. UI 없이 데이터 계층만 완결·검증.

### Phase 2 — chart kind 등록 + 렌더 골격 — ✅ DONE (2026-06-02)
- `types.ts`: `DomainKind += "chart"`, `ChartAttrs { frame, datasetId, chartType, encoding,
  palette?, showLegend?, showAxis?, opacity? }`, `ItemAttrsByKind.chart`.
- `domain-kinds.ts`: SPECS `chart` 엔트리(meta/renderer=`ChartBlock`/`defaultAttrs`(빈 ref:
  datasetId:"", bar, encoding 빈)/`participatesInZorder: true`).
- **Render gate**: `isDomainItem` 은 이미 `KNOWN_DOMAIN_KINDS`(SPECS 파생)라 chart 자동 포함 —
  WI-058 시절의 하드코딩 allowlist 는 AUDIT-005 에서 레지스트리화됨. `domain-kinds.chart.test`
  가 membership/z-order/seed 를 명시 가드. `allowedChildKinds`(use-weave-editor)는 qr/text 도
  미포함이라 비-게이트로 확인 → chart 도 생략(qr 선례).
- **dataset 접근**: 렌더러는 `{ item }` 만 받으므로 `DatasetContext`(신규
  `dataset/dataset-context.tsx`) 도입 — `DatasetProvider doc={docInAgocraft}` 를 DesignPage +
  PresentPage 의 `DocumentForResolutionProvider` 안에 중첩, `ChartBlock` 은 `useResolveDataset()`
  로 해석. provider 밖(테스트/read-only)에선 null resolver → placeholder. doc memo 로 update 시
  자동 재렌더(반응성).
- `ChartBlock.tsx`: 해석 → bar SVG(`preserveAspectRatio:none`, 프레임 채움). dangling/빈 datasetId/
  빈 encoding → "데이터 없음" placeholder. Phase 2 는 **bar 첫 시리즈만**(line/pie/멀티시리즈는
  Phase 3 어댑터).
- 가드 결과: `ChartBlock.test`(5, renderToStaticMarkup — placeholder×3 / bar 렌더 / 축 토글) +
  `domain-kinds.chart.test`(4) green. 전체 **384/384 green**, typecheck/biome 클린.
- **미검증(정직)**: 브라우저 라이브 검증은 chart 생성 UI(add-menu)가 없어 Phase 4 로 이연 —
  현재는 jsdom 렌더 테스트가 최선의 검증. round-trip(저장→로드)도 storage 배선이 닿는 Phase 4/5
  에서 e2e 로 확정.

### Phase 3 — 차트형 어댑터 (bar/line/pie) — ✅ DONE (2026-06-02)
- `domains/chart/chart-type-registry.ts`: `ChartTypeAdapter`(`render(ChartRenderInput)→ReactNode`) +
  `ChartTypeRegistry`(register/get/list, insertable/toolbar-section 레지스트리 1:1) + 공유 헬퍼
  `toNumber`/`seriesMax`(DRY — cell→좌표 단일 지점).
- 어댑터 각 1파일: `bar-adapter`(그룹 막대, row×series), `line-adapter`(시리즈별 polyline + 포인트),
  `pie-adapter`(첫 시리즈 슬라이스, 단일 슬라이스=full circle, all-zero→null). `default-registry.ts`
  싱글톤에 3개 register.
- **Rule 6**: `ChartBlock` 은 `chartType` switch 없이 `chartTypeRegistry.get(chartType)` dispatch
  만 — 새 차트형 = 어댑터 + register 1줄, ChartBlock 무수정. 미지의 chartType / 어댑터 null
  반환(all-zero pie) → placeholder(graceful).
- 멀티시리즈 지원(`encoding.values[]` 전체). bar/line 은 시리즈별 색(palette 순환), pie 는 카테고리별 색.
- 가드 결과: `chart-type-registry.test`(10 — toNumber/seriesMax/레지스트리 register-unregister + bar/line/pie
  지오메트리·엣지) + `ChartBlock.test` 디스패치(line→polyline, pie→3 slice, 같은 dataset). 전체
  **395/395 green**, typecheck 클린, biome 에러 0(positional key advisory 경고만, QrBlock 선례 동일).

### Phase 4 — 속성 패널(chart) + selection VM + add-menu — ✅ DONE (2026-06-02) · 첫 브라우저 검증
- **1-트랜잭션 생성** `weave.chart.add`(commands.ts): 시드 dataset `unit.create` + chart
  `item.create` 를 **한 트랜잭션**(한 Cmd+Z 로 둘 다 제거)으로 emit. encoding 은 시드 컬럼에서
  파생(첫 열=category, 나머지=values). add-menu·에이전트 공용 진입점.
- `toolbar/sections/chart-section.tsx` + `index.ts` register: chartType Select(막대/선/파이) +
  encoding(항목 열/값 열, 컬럼 옵션은 `useResolveDataset()` 컨텍스트로 해석) + Opacity. 기존
  primitive 재사용(LineSection 미러) — 신규 design-system primitive 0.
- `use-selection-chrome-registry.ts`: `["frame","image","video","qr","chart"]` 에 chart 추가 →
  표준 resize/rotate 핸들.
- add-menu `DesignHeader` "데이터 > 차트" + **신규 `IconChart`**(design-system) — `addNewItem` 에서
  chart 만 `weave.chart.add` 로 라우팅(container/frame/camera 로직 재사용).
- **design-system triage**: `IconChart` 새 glyph → `records/design-reviews/DR-design-029` (Grew×1,
  패널은 Reuse). 데이터 표 패널은 Phase 5 로 이연.
- 가드 결과: 유닛 `chart-add-command.test`(4 — 2패치/참조/커스텀/undo) + 전체 **399/399 green**.
  **e2e `chart-item.spec.ts` 2/2 (실 Chromium)**: 생성→4막대 렌더, chartType bar→line→pie 재렌더,
  **dataset 수정→차트 reflow(반응성 라이브 입증)**, dataset 삭제→placeholder, Cmd+Z 가 생성 전체
  되돌림. add-menu e2e 7/7 회귀 0. typecheck/biome 클린.
- **이제 브라우저에서 차트를 만들고 관찰 가능** — Phase 2 의 미검증 항목(라이브 렌더/반응성) 해소.

### Phase 5 — dataset 편집 패널 (데이터 관리 아이템 UI) — ✅ DONE (2026-06-02) · 브라우저 검증
- 순수 표 변형 헬퍼(dataset-store.ts): `coerceCell`(숫자열→number) / `setCell` / `addRow` /
  `removeRow` / `addColumn` / `removeColumn` / `renameColumn`(키 remap, 충돌/공백/누락 no-op).
  전부 순수·불변 → 단위 테스트(`dataset-transforms.test` 8).
- `DatasetEditorDialog.tsx`(Dialog/TextField/Button 재사용, 신규 primitive 0): 라이브 payload 를
  `useResolveDataset()` 로 읽어 편집 가능한 표 렌더(셀/열이름 onBlur 커밋, 행/열 추가·삭제 즉시).
  모든 변경은 `weave.dataset.update({ id, patch })` 1트랜잭션. 셀 input 은 값-keyed uncontrolled →
  외부 변경(undo)에 remount.
- `ChartSection` "데이터 편집" 버튼 → 다이얼로그. 단일 dataset 일 때만 활성.
- **공유 반응성**: dataset 은 root-unit 단일 소스라, 패널 편집이 같은 id 참조 chart **전부** 실시간
  reflow(별도 배선 0).
- 가드 결과: 전체 **407/407 green**. **e2e `chart-item.spec.ts` 패널 테스트(실 Chromium)**: chart 선택
  →패널 오픈→행 추가(차트 4→5 reflow)→행 삭제(→4)→열 추가(헤더 3열)→완료, Cmd+Z 가 편집들을
  되돌림(merge window 500ms 인지해 편집 간 분리). chart-item 3/3 통과. typecheck/biome 클린.
- design-system: 신규 primitive 없음(기존 Dialog/TextField/Button 합성). DR-design-029 의 "데이터 표
  패널 Phase 5" 항목 충족 — 표는 일반 `<table>` + 토큰 스타일, 데이터그리드 primitive 승격은 불필요로
  판명(재사용 가치 미확인).

### Phase 6 — 에이전트 스키마 — ✅ DONE (2026-06-02)
- `weave-command-schemas.ts`: `CHART_ATTRS_NOTE`(공유 attrs 설명에 합성) + `DATASET_PAYLOAD` 스키마
  + 4개 커맨드 스키마(`weave.chart.add` / `weave.dataset.add/update/remove`) + 라벨.
- **설계 변경(계획 대비)**: `ITEM_KIND += "chart"` 를 **하지 않음**. chart 를 `weave.item.add` 의
  kind enum 에 넣으면 datasetId 빈 placeholder 만 생기는 footgun → 대신 `weave.chart.add` 를
  **유일한 생성 경로**로 노출(시드 dataset + chart 1-스텝). CHART_ATTRS_NOTE 가 "weave.item.add+
  kind:chart 쓰지 말고 weave.chart.add 사용" 명시. (= WI 의 "자동 시드" 의도를 더 안전하게 충족.)
- `weave.dataset.update` 는 선언형(`dataset`)만 노출(UI 의 `patch` 함수는 에이전트 비도달).
- 가드 결과: `weave-command-schemas.chart.test`(5 — 4커맨드 노출/라벨, chart.add 옵션 계약,
  dataset.update id-required·patch 미노출, remove destructive, **item.add kind enum 이 chart 제외**)
  green. 전체 **412/412 green**, typecheck/biome 클린.
- **검증 한계(정직)**: 실제 LLM 경로 e2e 는 비결정적이라 생략 — 대신 스키마 계약을 결정적으로 가드.
  커맨드 자체의 런타임 동작은 Phase 4/5 의 유닛+e2e 로 이미 입증됨(에이전트는 동일 커맨드 호출).

### Phase 7 — QA / 정리 / Decommission sweep — ✅ DONE (2026-06-02)
- **round-trip(저장→로드) 무손실**: `dataset/round-trip.test.ts` — `weave.chart.add` 로 만든 chart+dataset
  를 storage serializer(toJSON→JSON→fromJSON, `onUnknown:preserve`) 통과시켜 dataset payload(한글
  컬럼 포함)·chart attrs(datasetId/chartType/encoding)·참조 해석 전부 무손실 입증. **DR-031 게이트 충족.**
- **e2e 회귀**: chart-item 3/3 + contextual-toolbar 5/5 + history-item-lifecycle + add-menu 7/7 green
  (선택 크롬·툴바 섹션·add-menu·history 표면 — 내가 건드린 곳 회귀 0).
- **Decommission sweep**: 미사용 export `datasetUnitHost`(Phase 1 잔재) 제거 + 그로 인한 미사용 import
  정리. 그 외 전부 가산적이라 obsolete 산출물 없음.
- 전체 유닛 **413/413 green**, typecheck/biome 클린.
- 기록 최종화: DR-031 → **Accepted**(2026-06-02), FR-015 → Confirmed, DR-design-029 Phase 5 addendum,
  WI-077 → Done.
- **라이브러리 결정(개정 — DR-033, 2026-06-02)**: 사용자 요청으로 렌더를 **lazy ECharts(SVGRenderer)**
  로 전환. DR-031 데이터 모델은 불변, 자체 SVG 어댑터는 Decommission. 상세는 아래 Phase 8.

### Phase 8 — 렌더 ECharts 전환 (DR-033) — ✅ DONE (2026-06-02) · 브라우저+빌드 검증
- **agocraft 플러그인 제약 발견**: `RenderableAdapter`(canvas2d)는 weave 의 React `FrameSurface` 와
  안 맞음(weave 는 canvas 렌더러 미사용) → "플러그인+lazy"의 본질을 **weave-side lazy React 모듈**로 구현.
- **라이브러리 평가**(ECharts/visx/Recharts/자체-SVG, 3관문+번들+줌) → **ECharts + SVGRenderer + lazy**
  선택(사용자 확정). DR-033 에 평가표.
- `echarts-option.ts`(순수, echarts-free): `{rows,encoding,chartType,palette,…}` → ECharts option.
  chartType→builder registry(Rule 6).
- `echarts-renderer.tsx`(lazy 청크 유일 echarts 참조): `use([Bar/Line/Pie, Grid/Legend/Tooltip,
  SVGRenderer])`, `init(el,{renderer:'svg'})` + ResizeObserver + dispose.
- `ChartBlock` = thin shell: placeholder/데이터 해석/컨테이너 data-attrs + `<Suspense>` 뒤 lazy
  `EChartView`. 자체 SVG 어댑터/registry/그 테스트 **Decommission**.
- 검증: **빌드에서 `echarts-renderer-*.js` 별도 청크 193KB gz 분리 확인**(main 번들 0 영향, 온디맨드 로드).
  유닛 `echarts-option.test`(7) + `ChartBlock.test`(5, echarts mock·SSR fallback) green. **e2e
  chart-item 3/3(실 Chromium, echarts svg 마운트·chartType 전환·dataset reflow·undo·placeholder)**.
  전체 **409/409 green**, typecheck/biome 클린.

### Phase 9 — 데이터 입력 편의 (lazy react-data-grid, DR-034) — ✅ DONE (2026-06-03) · 브라우저+빌드 검증
- **순수 클립보드 파서**(dataset-store.ts): `parseClipboardTable`(TSV/CRLF) + `detectHeaderRow`(첫 행
  라벨·이후 행 숫자 → 헤더) + `clipboardTableToPayload`(헤더 자동 감지·열명 dedupe·셀 coerce·ragged
  처리). `clipboard-import.test`(11).
- `DatasetGrid.tsx`(lazy 청크 유일 react-data-grid 참조): 셀 편집(`textEditor`)·키보드·셀 복붙·**드래그필
  (`onFill`)** 내장 + `onRowsChange`→`weave.dataset.update`. 헤더 rename/열삭제(`renderHeaderCell`),
  행삭제(액션 컬럼). `--rdg-*` → weave 토큰 테마.
- **멀티셀 붙여넣기**(래퍼 `onPasteCapture`): **앵커 붙여넣기**(선택 셀부터 `pasteTableAt`로 채우고
  행/열 자동 확장·나머지 보존, `onSelectedCellChange`로 앵커 추적) / 선택 없으면 **표 가져오기**(전체
  교체, 헤더 자동). 단일 셀은 그리드 위임.
- `DatasetEditorDialog` = shell: 이름/행·열 추가/`<Suspense>` 뒤 lazy `DatasetGrid`. 손수 `<table>` +
  미사용 `setCell` **Decommission**.
- **⚠️ 버전 핀**: `react-data-grid@7.0.0-beta.47`(peer `^18||^19`). latest **beta.59 는 React 19 전용 →
  React 18 weave 에서 런타임 크래시**. beta.47 의 `textEditor`(not renderTextEditor) + `DataGrid` default
  export 차이 주의.
- 검증: **빌드 `DatasetGrid-*.js` 13.8KB gz + CSS 1.9KB gz 별도 청크 분리**(main 0 영향). 유닛
  `clipboard-import.test`(15 — 파서·헤더감지·import·**앵커 pasteTableAt**) green. **e2e chart-item
  4/4(실 Chromium)**: 그리드 마운트 + 행 추가 + 엑셀 블록 import reflow + **앵커 붙여넣기(선택 셀부터
  채움·나머지 보존)** + Cmd+Z 복원. 전체 **423/423 green**, typecheck/biome 클린.

## Risks

- **참조 무결성**: dangling datasetId — `resolveDataset` 단일 경로 + placeholder + 테스트로 못박음.
- **반응성 누락**: chart 가 datasetId 룩업을 캐시/메모이즈하면 dataset 변경 미반영 위험 — 매 렌더
  doc 스냅샷에서 룩업(파생 메모는 dataset 참조를 deps 로).
- **render gate 누락**: `isDomainItem` += chart 빠지면 무음 미렌더(WI-058 gotcha) — Phase 2 체크.
- **라이브러리 번들/round-trip**: vendored dep 체인(pnpm/vite) 마찰 + `sideEffects` 게이트 —
  `/evaluate-library` 결론 전엔 자체 SVG(bar)로 비차단 진행. canvas 출력 라이브러리면 썸네일/
  내보내기 경로 별도 검증.
- **비시각 개념 일관성**: dataset 이 z-order/selection/마퀴/컬링에 새지 않도록(unit 거주, kind 아님)
  — Phase 1 에서 캔버스 표면 비노출 검증.
- **capability 커버리지**: chart 의 transform/clipboard/reparent 등 기존 kind capability 새 kind
  커버리지 누락 주의(qr `participatesInZorder:false` 처럼 옵트 결정 명시).

## Cross-project

없음 — agocraft 변경 0(attrs/Unit 불투명). DR-025(line)과 달리 HANDOFF 불필요. 전부 weave-side.

---

## WI-078 — Interactive chart elements (FR-016 / DR-035) — 📋 PLANNED (승인 대기)

차트를 하이브리드 인터랙티브 차트로: 실제 텍스트 아이템 레이블 + 시리즈 클릭 선택 + per-element 표현
override + 데이터 양방향. 데이터 모델(DR-031)·dataset(DR-034)·ECharts 마크 렌더(DR-033) 불변.

### Phase A — per-element 표현 override + 요소 선택/편집 — ✅ DONE (2026-06-03) · 브라우저 검증
- `ChartAttrs.overrides`(신규, **안정 키=카테고리명**): `ChartOverrides{ datum:{[cat]:{color,borderWidth,offset}} }`.
  `echarts-option.ts` 가 datum override → `series.data[i].itemStyle`(bar/line), pie `selected`+`selectedOffset` 주입.
- `echarts-renderer.tsx`: `chart.on('click', p)` → `ChartClickInfo{category,seriesName,value}` 콜백(ref 패턴).
- 선택 브릿지: `chart-element-context.tsx`(React context — ChartBlock publish, ChartSection 편집), DesignPage provider.
- 순수 헬퍼 `chart-overrides.ts`(`setDatumOverride` merge/clear/collapse, `datumOverride`).
- 편집 UI `chart-element-editor.tsx`(색 ColorPicker + 두께/도넛거리 range + 해제) → `weave.item.update(attrs.overrides)`.
  **표현만** 편집(데이터 불변). 값-클릭 편집은 후속.
- 가드 결과: 유닛 `chart-overrides.test`(8) + `echarts-option.test`, 전체 **431 green**. **e2e(실 Chromium)**:
  막대 클릭→강조 편집기→두께 override 저장·데이터 불변. **막대 클릭이 ECharts 도달**(포인터 가로채기 없음 —
  핵심 통합 리스크 해소). chart e2e 5/5, 빌드 청크 분리 유지, typecheck/biome 클린.

### Phase B — weave-computed 카테고리 레이블 + 데이터셋 동기화 — ✅ DONE (2026-06-03) · 브라우저 검증
- **위치 전략 = weave 직접 계산**(사용자 확정): `chart-label-layout.ts` 의 `CHART_PLOT_MARGINS` 를 weave 가
  소유 → `categoryLabels`(bar 밴드중앙/line 포인트, ratio 좌표). 같은 여백을 ECharts grid 에 주입
  (`containLabel:false`)해 막대/포인트가 weave 레이블과 정렬. ECharts x축 레이블은 off.
- ECharts `convertToPixel` 추종 **불채택**(fragile) — weave 직접 계산이라 리사이즈 시 ratio 프레임으로 자동 반영.
- 레이블은 `ChartBlock` 의 weave 텍스트 버튼(theme 토큰, echarts svg 위). 클릭 → 선택(role:'label').
- 편집 `chart-label-editor.tsx`: 텍스트 → `weave.dataset.update`(`setCell` 카테고리 셀 rename) — **데이터셋
  단일 진실원**. 레이블 STYLE(폰트/색)은 후속.
- 가드 결과: 유닛 `chart-label-layout.test`(5) + `setCell` 테스트, 전체 **437 green**. **e2e(실 Chromium)**:
  weave 레이블 4개 렌더 → "A" 클릭→"1분기" 편집 → 데이터셋 row0 항목="1분기" 동기화 + 레이블 reflow.
  chart e2e 6/6, 빌드 청크 분리 유지, typecheck/biome 클린.
- **범위 정직**: 완전한 독립 doc-tree text Item(차트 밖 드래그)은 Phase C(컨테이너 모델). Phase B 는
  weave-rendered 레이블(위치·렌더·편집·동기화).

### Phase C (FINAL, 2026-06-03) — 레이블 = 비-undo 파생 투영 ✅ **(아래 C.1/C.2/C.3·D.2 를 대체)**
사용자 최종 명세: "텍스트아이템만 사용 / 분리(promote)기능 제거 / ECharts 텍스트 숨김 / 그 영역에 텍스트
아이템 자동배치." reconcile 방식 = "바로 진행(방식 위임)".

- **레이블 = 실제 weave `text` 자식 전용**(div·promote 제거). `NestedFrame` 재귀 렌더로 차트가 선택·편집 가능한
  text 자식 보유 → 컨테이너 게이트 확장 불필요(A-lite). ECharts 카테고리 축 텍스트 off.
- **비-undo·비-sync 파생 투영**: `chart-label-sync.ts` 의 순수 `projectAllChartLabels(doc)->doc`(core
  `addChild`/`updateChild`/`removeChild`, 결정적 id, drift 0 → 동일 참조). `use-chart-label-sync.ts` 가
  `useEffect([reconcileDerived, doc])` 로 구동. 호스트 `use-design.ts:reconcileDerived` 가 **History·ChangeStream
  우회**. → **이유: 수렴 컨트롤러 + undo 기록 = undo deadlock**(undo 가 지운 레이블을 컨트롤러가 재생성, undo 가
  레이블 레이어를 통과 못 함). 투영은 멱등→1패스 수렴. 동기화: 각 클라이언트가 데이터셋에서 로컬 재생성.
- **레이블 편집→데이터셋(편집 위임)**: 더블클릭=네이티브 텍스트 편집(툴바 아님). `DesignPage.onUpdateItem` 가
  `chartLabelRef` 감지 시 `weave.dataset.update`(항목 셀 rename, **undoable**) 로 라우팅. 컨트롤러가 재파생.
- **Decommission**: `promotedLabels`·`ChartLabelStyle`·`setLabelOverride`/`labelOverride`·`overrides.label`·
  `chart-label-editor.tsx`·div 레이블·`pieLabels`·element-context `role:"label"` 전면 삭제. **mark(datum) override 만 잔존**.
- **pie**(2026-06-03 추가): 차트 px **종횡비 = 디자인 px × 차트 frame** → 원을 ratio 타원으로 매핑해 순수 계산.
  `pieLabelLayout(categories, values, aspect)`(값-가중 mid-angle, top·시계). `useChartLabelSync` 에 designW/H 주입
  (리사이즈 재배치). ECharts pie `label/labelLine` `show:false`. bar/line 종횡비 무관. e2e: bar→pie 레이블 재배치 검증.
- **검증**: 유닛 **426 green**, 차트 e2e **8/8**(undo 카운트 *고정* — 레이블이 History 에 없음, 실-텍스트 레이블
  더블클릭→데이터셋 동기화 브라우저 확인), history/text-item 회귀 0, 빌드 청크 분리(echarts 193KB / DatasetGrid 13.85KB gz).
- 상세 근거: **DR-035 Addendum(2026-06-03)**.

<details><summary>중간 설계 로그 (C.1/C.2/C.3·D.2 — 위 FINAL 로 대체됨, 이력 보존)</summary>

### Phase C — chart 컨테이너 모델 (진행 중)
- **C.1 레이블→실제 자식 text Item 승격** ✅ (2026-06-03): **타당성 발견** — weave `NestedFrame` 이
  `item.children.filter(isDomainItem)` 로 **chart 자식도 재귀 렌더**(frame 게이트 무관). → `ChartAttrs.promotedLabels`
  + "텍스트로 분리"(`weave.item.add` kind:text, containerId=chartId, 프레임=레이블 위치) + ChartBlock managed
  레이블 스킵. 승격 text = 진짜 weave 아이템(차트 자식, 선택·이동·스타일; free·동기화 끊김). **승격은
  beginBatch/endBatch 로 1트랜잭션(Cmd+Z 1회 복원)**. e2e: text-block 렌더 + 이동 후 렌더 유지(1급 아이템) +
  Cmd+Z 1회 전체 복원. chart e2e **11/11**.
- **방향 정정(사용자, 2026-06-03)**: 기본 레이블은 **관리형 위치(echart 따름, 자유 드래그 X)** + **텍스트아이템
  수준 편집**(폰트 속성). C.1 자유 승격은 명시적 opt-out 으로 유지.
- **C.2 관리형 레이블 폰트 속성** ✅ (2026-06-03): `ChartLabelStyle` += italic/fontFamily, `FONT_FAMILY_PRESETS`
  를 `toolbar/font-presets.ts` 추출(텍스트 툴바와 공유). label-editor 에 글꼴 Select + 기울임 토글. 관리형 위치 유지.
  e2e 굵게+기울임 검증. 유닛 446 green.
- **C.3 더블클릭 인라인 편집 + 자동 동기화** ✅ (2026-06-03): 사용자 정정("무조건 텍스트 편집모드, 더블클릭→
  인라인, 툴바 입력 X" + 자동 동기화). **핵심 단순화**: 레이블이 데이터 파생이라 자동 동기화 공짜 → reconcile/
  doc-item 대공사 불필요. ChartBlock 레이블 단일클릭=선택(폰트 메뉴)/더블클릭=인라인 input→`useDatasetCommit`
  (DatasetContext editor-bound setCell)→카테고리 셀. 툴바 텍스트입력 제거. e2e 더블클릭 편집→데이터셋 동기화.
  chart e2e 11/11, 유닛 446 green.
- 📋 (선택) 승격 해제, drill 게이트.

</details>

### Phase D — QA / round-trip / Decommission
- override + 레이블 round-trip 무손실; 재생성 시 override 안정-키 보존; 데이터 변경/붙여넣기 충돌 0.
- DR-035 Accepted 전환, DR-033 amend 반영.

### Phase D — 디테일 편집 (진행 중)
- **D.1 마크 값 클릭 편집** ✅ (2026-06-03): `ChartClickInfo.dataIndex`→mark ref `rowIndex`; `ChartElementEditor`
  "값" input → `weave.dataset.update(setCell)`. valueColumn=시리즈명?? 첫 값열. e2e 검증(값 200→데이터셋
  셀 1개 갱신). 데이터/표현 경계 유지(값=데이터, 색·두께·오프셋=override).
- **D.2 레이블 스타일 override** ✅ (2026-06-03): `ChartLabelStyle`(color/fontSize/bold) + `ChartOverrides.label`,
  `setLabelOverride`(datum 공존 보존), ChartBlock 적용, `chart-label-editor` 색·크기·굵게 → `weave.item.update`.
  레이블 텍스트=데이터셋 / 스타일=override 분리. e2e(굵게→override 저장·데이터 불변·font-weight 700).
- **D.3 파이 슬라이스 레이블 + round-trip** ✅ (2026-06-03): `ChartBlock` ResizeObserver px 측정 → `pieLabels`
  (값 가중 mid-angle, top·clockwise). 파이 레이블 클릭→편집→데이터셋. `round-trip.test` override(datum+label,
  안정키) 무손실 보존. e2e 파이 레이블 4개 렌더+편집. **445 유닛 / chart e2e 9/9 green**.
- **D.4 마크 삭제=행 삭제** ✅ (2026-06-03): `ChartElementEditor` "행 삭제" 버튼 → `weave.dataset.update`
  (`removeRow(rowIndex)`) + 선택 해제. Delete 키(=weave 아이템 삭제) 충돌 회피 위해 패널 버튼. e2e: 막대 클릭
  →행 삭제→데이터셋 1행 감소·차트 reflow(4→3). chart e2e **10/10**.

### 미해결(승인 시 착수)
- ~~컨테이너 모델(Phase C — 레이블을 독립 doc-tree Item 으로)~~ ✅ Phase C(FINAL): 레이블=실제 text 자식(파생 투영).
- 막대 높이 드래그=value(현재는 패널 input).
- ~~파이 레이블의 실-text-아이템화~~ ✅ (2026-06-03): aspect 도출로 원형 배치 해결, pie 도 실 text 레이블.
