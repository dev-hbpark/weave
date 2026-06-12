# WI-193 — scatter/bubble 2-D 포인트 직접조작 핸들 + 핸들 값 2D 일반화

- 상태: DONE (2026-06-12)
- 출처: DR-126 §후속 보류분 — "scatter/bubble 2D 포인트 드래그(2-셀 쓰기용
  신규 handle kind 필요)". WI-192 전수조사 갭①의 연장.
- 결정: DR-126 (갱신 — scatter/bubble DONE, radar 재보류)
- 선행: WI-092 (FamilyGeometry 레지스트리 + 핸들 plumbing), WI-192 (gauge
  핸들 + DR-126 커버리지 규칙)

## 문제

WI-092의 핸들 값 plumbing은 **단일 스칼라**(`valueAtClient → number`,
`apply(raw: number)`)였다. scatter/bubble 포인트는 값 = (x, y) **2-셀**이라
이 plumbing으로 표현 불가 → DR-126에서 "신규 handle kind 필요"로 보류했었다.
한편 scatter/bubble은 ECharts cartesian grid 위라 `convertToPixel`/
`convertFromPixel`이 동작(pie/gauge와 달리 순수 커널 불필요) — 막힌 곳은
오직 값 채널의 차원이었다.

## 해결

1. **핸들 값 2D 일반화** (`chart-geometry-store.ts`):
   `ChartHandleValue = number | { x; y }`. `valueAtClient` 반환형을 이걸로
   넓힘. `ChartHandleKind`에 `"point"`, anchor.axis에 `"free"`(제약 없는 2D
   드래그 → move 커서) 추가.
2. **scatter FamilyGeometry 어댑터** (`chart-geometry-provider.ts`):
   `scatterPointHandle`(kind `"point"`, axis `"free"`) — anchor는
   `convertToPixel([x,y])`, valueAt는 `convertFromPixel → {x,y}`. `pointXY`로
   `[x,y]`/`[x,y,size]`(bubble) 모두 위치쌍 추출. `FAMILY_BY_SERIES_TYPE.scatter`
   레지스트리 row(bubble도 series type `"scatter"`라 1 row로 커버).
   `FamilyHandle.valueAt` 반환형도 `ChartHandleValue`로 확장.
3. **point 쓰기 경로** (`chart-element-view-model.tsx`):
   `APPLY_BY_KIND.point` — x·y 두 셀을 **한 패치**(`setCell(setCell(...))`)로
   써 2D 드래그가 단일 undo 스텝. 기존 스칼라 빌더 4종은 `scalar()` 래퍼로
   감싸 2D 값을 무시(타입안전, per-kind 분기 없음). `startHandleDrag` 디둡
   키를 number/2D 양쪽 처리. `ChartDataBinding`에 `xColumn`/`yColumn` 추가.
4. **바인딩** (`use-selection-chrome-registry.ts`): `getBinding`이
   `channelFields(enc,"x")[0]`/`"y"`로 x·y 컬럼 제공.

기존 `value`/`bar-width`/`pie-inner-radius`/`gauge` 핸들은 number를 계속
반환 → 와이드 union과 호환, 무변경.

## 검증 (Continuous Self-Verification)

- 유닛: `chart-geometry-provider.test.ts` 신설(7건 — 가짜 EchartsLike identity
  convert로 family 디스패치 + point anchor/valueAt 2D 매핑 고정) → 차트 유닛
  **136 green**. `tsc` 0.
- e2e (라이브 :5179): `chart-mode-layout-matrix`에 scatter 케이스 추가 →
  point 핸들 visible + cursor `move`, 드래그가 **x·y 두 셀 모두** 변경,
  Cmd+Z가 둘 다 1스텝으로 복원. 매트릭스 **6/6 green**. 기존 WI-092 핸들
  e2e **8/8 green**(plumbing 변경 무회귀). 게이트(lint·Rule6·inheritance) green.

## 산출물

- 코드: `chart-geometry-store.ts`(ChartHandleValue/point/free),
  `chart-geometry-provider.ts`(scatter 어댑터), `chart-element-view-model.tsx`
  (point 쓰기 + scalar 래퍼 + 디둡), `use-selection-chrome-registry.ts`(x/y 바인딩).
- 테스트: `chart-geometry-provider.test.ts`(신규 7), `chart-mode-layout-matrix.spec.ts`(+scatter).
- 기록: 본 WI, DR-126 갱신.

## 후속 (radar — 재보류, 근거 sharpened)

radar 정점 핸들은 scatter보다 큰 별도 작업이라 본 WI에 포함하지 않음:
- radar 마크 클릭은 **role="series"**(폴리곤=시리즈; `chart-selection.ts`
  BY_FAMILY polar). 그런데 chart-element-view-model의 핸들 렌더는
  `ref.role === "datum"`에서만 동작 → series-role 렌더 경로 부재.
- 정점 = (series, axis) = row(axis)×col(series) 단일 셀. ECharts radar는
  **정점별 클릭 이벤트를 주지 않음**(폴리곤 클릭 = 시리즈).
- 필요 작업: (a) series-role 다중정점 핸들 렌더 분기, (b) 각 정점 핸들이
  자기 `rowIndex`(=axis) 보유 + apply가 `spec.rowIndex`·`ref.seriesName`으로
  셀 타겟(현 `value` apply는 `ref.rowIndex` 사용), (c) radar 순수 기하 커널
  (center·R·축별 각도·값↔반경, pie 유사 N축).
→ 별도 WI 후보. 그 전까지 radar는 패널+element-편집기로 조작(전수조사 결론
대로 조작 자체는 가능, 캔버스 직접조작만 미제공).
