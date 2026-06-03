# Engineering Plan — 차트 데이터 모델 일반화 (WI-079 / DR-036 / FR-017)

> **상태: P1~P5 구현·검증 완료 (2026-06-03).** 유닛 455 green, 차트 e2e 9/9, tsc/biome 클린, 빌드 청크 분리 유지.
> 이제 차트 추가는 데이터 모델 무변경으로 `CHART_TYPE_REGISTRY` 엔트리 + 빌더 1개 (후속 WI-080+).
> 구현 파일: `dataset/dataset-store.ts`(타입드 컬럼+마이그레이션), `domains/chart/chart-model.ts`(채널 인코딩),
> `domains/chart/chart-types.ts`(레지스트리+`buildChartOption`), `domains/chart/echarts-option.ts`(순수 빌더 export),
> `dataset/DatasetGrid.tsx`(타입 셀렉터), `toolbar/sections/chart-section.tsx`(레지스트리-구동 타입 피커),
> `pages/DesignPage.tsx`(라벨→데이터셋 라우팅을 채널 accessor 로).

차트 14종 추가의 **선행 작업**: 데이터 모델·인코딩·레지스트리를 그래픽-문법 모델로 일반화하고 기존 bar/line/pie 를
이관한다. 이 문서가 끝나면 차트 추가는 데이터 모델 무변경으로 레지스트리 엔트리 1개가 된다.

## 불변식 (작업 내내 유지)

- 모든 doc 변이는 `editor.exec`(History) — 데이터셋/인코딩 편집 동일. (라벨 투영만 DR-035 의 `reconcileDerived` 예외.)
- 변경 후에도 **bar/line/pie 동작·기존 chart e2e/unit 전부 그린**. 모델 이관은 동작 무변경 리팩터.
- round-trip 무손실(`onUnknown:"preserve"`), 미지 컬럼/채널 보존.

## P1 — 타입드 컬럼 (포맷)

| 파일 | 변경 |
|---|---|
| `dataset/dataset-store.ts` | `DatasetColumn {name,type,format?}`; `DatasetPayload.columns: DatasetColumn[]`; `DatasetCell` += `boolean\|null`; `inferFieldType(rows,name)`; `add/remove/rename/reorderColumn` 가 객체 배열 처리; `emptyDatasetPayload`/`normalize` 갱신; 헤더 감지·붙여넣기(`clipboardTableToPayload`)가 타입 추론 부여 |
| `dataset/migrate-chart-model.ts` (신규) | `migrateDatasetColumns`: `string[] → DatasetColumn[]`(타입 추론). idempotent |
| `dataset/DatasetGrid` | 컬럼 헤더에 **타입 셀렉터**(4종) 노출 — 사용자가 추론 결과 정정 |
| 테스트 | `dataset-store.test`(inferFieldType/컬럼ops), `migrate-chart-model.test`(string[]→typed round-trip) |

## P2 — 채널 인코딩 (명칭)

| 파일 | 변경 |
|---|---|
| `types.ts` | `FieldType`, `FieldRef`, `Aggregate`, `Channel`, `ChartEncoding`, `ChartVariant`; `ChartAttrs.chartType: ChartType`(14 union), `.encoding: ChartEncoding`, `+variant?` |
| `echarts-option.ts` | `ChartRenderInput` 을 채널 입력으로 전환; bar/line/pie 빌더가 `encoding.category/value` 사용; pie `innerRadius`→radius[in,out] |
| `migrate-chart-model.ts` | `migrateEncoding`: `{category,values} → {category:{field}, value:[{field}…]}`; chartType 불변 |
| `chart-label-sync.ts` (DR-035) | `desiredLabels` 가 `encoding.category.field` 읽도록(현 `encoding.category` 문자열→FieldRef) |
| 테스트 | `echarts-option.test`(채널 입력), `migrate-chart-model.test`(인코딩 변환) |

## P3 — ChartTypeSpec 레지스트리 (Rule 6)

| 파일 | 변경 |
|---|---|
| `domains/chart/chart-types.ts` (신규) | `ChannelSlot`, `ChartTypeSpec`, `CHART_TYPE_REGISTRY: Record<ChartType,ChartTypeSpec>`. P3 범위는 bar/line/pie 엔트리만(나머지 11 은 후속 WI 가 추가) — 단 **스키마/레지스트리는 14 수용** |
| `echarts-option.ts` | `BUILDERS` → `CHART_TYPE_REGISTRY[t].buildOption` 로 이관(얇은 위임 유지 or 제거) |
| `domains/chart/echarts-renderer.tsx` | 사용 chartType 의 `spec.echartsModules` 만 동적 `use()` 등록(번들) |
| 테스트 | `chart-types.test`(레지스트리 완전성: 모든 채널 slot 의 accepts 유효, 빌더 존재) |

## P4 — 인코딩 편집 UI 데이터-주도화 ✅ (2026-06-03)

| 파일 | 변경 |
|---|---|
| `toolbar/sections/chart-section.tsx` | 하드코딩 "항목 열/값 열" 셀렉트 제거 → `spec.channels` 순회 `ChannelSlotField` 렌더. 컬럼은 `slot.accepts ∩ column.type` 필터. **`multiple` 슬롯(cartesian/radar `value`) = 토글 칩**(Button primary/subtle, 여러 열→여러 시리즈), 단일 슬롯 = Select(required 아니면 "(없음)"). chartType 피커는 `availableChartTypes()` 구동. 인코딩 read=첫 선택 차트, write=`setChannel`→`updateAll`(전체). bar/line/pie/radar UI 회귀 0 |
| `chart-model.ts` | `channelFields(enc,channel)` + `setChannel(enc,channel,fields,multiple)` (순수 read/write) |
| `chart-types.ts` | cartesian 채널에서 미사용 `series` 슬롯 제거(빌더가 wide multi-value 만 소비 → spec=실동작 일치) |
| 테스트 | 유닛 `chart-model.test`(channelFields/setChannel 다중·클리어). e2e `multi-value chips add series`(2번째 값 컬럼 칩 토글→encoding.value 2필드+aria-pressed). chart e2e 11/11 |

## P5 — QA / Decommission

- round-trip 게이트: 타입드 컬럼 + 채널 인코딩 + variant + overrides 무손실. 미지 보존.
- 마이그레이션: 레거시 `string[]`·`{category,values}` 픽스처 로드→정상 렌더.
- 구 경로 제거: `encoding.values` 직접 참조, bare-string 컬럼 가정 전부 제거(Decommission Sweep).
- chart e2e/unit 전부 그린, 빌드 청크 분리 유지, tsc/biome 클린.

## SOLID/GRASP 체크리스트 (DR-036 게이트 임베드)

- [ ] **Rule 6**: chartType 분기는 `CHART_TYPE_REGISTRY` 한 곳. 빌더 파일 1개/타입. `switch(chartType)` 신규 0.
- [ ] FieldType→축/시각 설정, family→라벨 레이아웃도 레지스트리(인라인 if/switch 금지).
- [ ] 인코딩 편집 UI 는 `spec.channels` 데이터-주도(차트별 JSX 분기 금지).
- [ ] 단일 진실원: 데이터=타입드 테이블 / 인코딩=채널맵 / 표현=overrides·variant. 교차 오염 금지.
- [ ] 안정 키: 인코딩=컬럼 이름, overrides=category 이름. 인덱스 키 금지.
- [ ] Open-Closed: 신규 chartType/Channel/FieldType 추가가 기존 분기 무수정으로 가능(후속 WI-080 이 증명).
- [ ] round-trip + `onUnknown:preserve`: 미지 컬럼/채널/variant 보존.

## 이후 (완료 — WI-080/081)

✅ **14종 전부 구현 완료.** radar(WI-080) + 나머지 10종(WI-081: area/funnel/gauge/scatter/bubble/heatmap/candlestick/
boxplot/treemap/sankey). 각 = `CHART_TYPE_REGISTRY` 엔트리 + 빌더 + ECharts 모듈, 데이터 모델·UI 무변경(P4 spec-구동
패널이 각 타입 채널 자동 렌더). 검증: 유닛 469, chart e2e 12/12(`all 14 chart families render` — 모듈 미import 0),
echarts lazy 청크 242KB gz.

선택적 후속: long-format `series` 채널, aggregate transform, treemap/sankey 텍스트-아이템 레이블, 사용-타입만 동적
모듈 등록.
