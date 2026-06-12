# DR-126 — 차트 datum 직접조작 핸들 커버리지 (어느 타입에 캔버스 핸들을 주는가)

- 상태: 채택 (2026-06-12); 갱신 (2026-06-12, WI-193 — scatter/bubble DONE)
- 작업: WI-192, WI-193
- 선행: WI-092 (bar/line·area/pie 직접조작 핸들 + FamilyGeometry 레지스트리),
  DR-035 (인터랙티브 차트 요소 — element 편집기/오버라이드), DR-036
  (CHART_TYPE_REGISTRY — 14종)

## 맥락

WI-092는 차트 datum을 캔버스에서 직접 끌어 값을 바꾸는 핸들을
`chart-geometry-provider.ts`의 **FamilyGeometry 레지스트리**(`FAMILY_BY_SERIES_TYPE`)
로 도입했다. 그러나 레지스트리에는 `bar` / `line` / `custom` / `pie`만
등록되어 있었고, 나머지 10종(scatter·bubble·candlestick·boxplot·funnel·
gauge·radar·heatmap·treemap·sankey)은 `familyFor → null → handles()=[]`로
**캔버스 직접조작 핸들이 없었다**. 이것이 의도인지 갭인지 명시한 기록이
없어, "왜 이 차트는 못 끄나"의 사용자 혼란 + 후속 작업의 판단 근거 부재가
있었다(WI-192 전수조사 갭①).

모든 14종은 직접조작 핸들과 **무관하게** 다음으로 세부 속성을 조작할 수
있음을 먼저 못박는다: **툴바 속성 패널**(타입/인코딩/팔레트/집계/범례·축/
불투명도/데이터셋 편집) + **element-클릭 편집기**(값/색/두께/삭제 — `markSelection`
이 전 family 커버) + **에이전트 명령**(`weave.item.update`/`weave.dataset.*`).
즉 직접조작 핸들은 *편의 가속*이지 유일 경로가 아니다.

## 결정 — 핸들은 "깨끗한 단일 스칼라 공간 제스처"가 있는 타입에만 준다

직접조작 핸들의 채택 기준: **(a) 마크의 한 값이 한 공간 차원에 자연스럽게
매핑되고, (b) 그 역(커서→값)이 픽셀정확하게 계산 가능하며, (c) 드래그 중
재정렬/다중-셀 쓰기 같은 부작용이 없다.** 이는 루트 원칙("패턴은 명명된
목적에 깨끗이 부합할 때만 적용 — 부합하지 않는 패턴은 거부")의 적용이다.

| 타입(들) | 핸들 | 판단 |
|---|---|---|
| bar / line / area | value(세로) + bar-width(가로, 단일계열 막대) | **있음** (WI-092) |
| pie | value(각도 sweep) + inner-radius(반경) | **있음** (WI-092) |
| **gauge** | **value(각도, 225°→−45° 단일 다이얼)** | **추가** (WI-192) — 단일값·고정 호·재정렬 없음·convert 불필요한 순수 각도 커널 |
| **scatter / bubble** | **point(2D 자유 드래그 → x·y 셀)** | **추가** (WI-193) — ECharts cartesian convert 재사용. 핸들 값 plumbing을 `number → ChartHandleValue(number \| {x,y})`로 일반화 + `point` kind. bubble은 series type `scatter`라 동일 경로. |
| radar | (정점 반경) | **재보류** (WI-193 §후속) — scatter보다 큰 별도 작업: ① 마크 클릭이 role=series(폴리곤)라 현 datum-handle 렌더 경로 밖 ② ECharts radar는 정점별 클릭 미발행 ③ series-role 다중정점 렌더 + per-vertex 셀 타겟(spec.rowIndex) + radar 순수 커널 필요. 별도 WI. |
| funnel | (세그먼트 너비) | **보류** — `sort:"descending"` 드래그 중 재정렬 + convert 부재로 레이아웃(min/max/gap) 픽셀복제 fragile. |
| heatmap | — | **패널 전용** — 셀 강도=값, 공간↔값 매핑 없음(셀 위치는 x·y 카테고리). |
| treemap | — | **패널 전용** — 타일 면적=값, 면적 드래그는 전체 타일링 재배치 유발. |
| sankey | — | **패널 전용** — 노드/링크 폭=값, 흐름 보존 재배치 유발. |
| candlestick / boxplot | — | **패널 전용** — 한 마크가 다성분(OHLC 4 / 5수)이라 단일 스칼라 제스처 없음. |

## 근거

- **gauge를 고른 이유**(WI-192): 단일값(첫 행), 기본 225°→−45° 270° 호
  (`gaugeOption` 미오버라이드), `max`는 렌더 옵션에서 lockstep으로 읽음 →
  pie sweep과 동형의 순수 커널로 픽셀정확·재정렬 없음·브라우저 검증 가능.
- **scatter/bubble을 다음으로 한 이유**(WI-193): ECharts cartesian이라 convert가
  바로 동작(순수 커널 불필요) — 유일한 장애물이던 "값=2-셀"을 핸들 값 채널을
  `ChartHandleValue` union으로 일반화해 해소. 이로써 (a)(b)(c) 충족 + 단일
  undo(두 setCell 한 패치). 이 일반화는 향후 다축 핸들의 공통 토대.
- **보류 vs 패널전용 구분**: 보류(radar/funnel)는 *깨끗한 제스처는 있으나*
  렌더 경로/선검증/레이아웃 복제 비용이 큰 것. 패널전용(heatmap/treemap/
  sankey/candlestick/boxplot)은 *단일 스칼라 공간 제스처 자체가 없는* 것 —
  억지 핸들은 거부.
- **확장점 보존**: 신규 타입 핸들 = `chart-geometry.ts` 순수 커널 +
  `chart-geometry-provider.ts` FamilyGeometry 어댑터 1개 + `FAMILY_BY_SERIES_TYPE`
  row 1개. `kind:"value"`면 view-model/APPLY_BY_KIND 변경 0. Rule 6 유지.

## 영향

- `FAMILY_BY_SERIES_TYPE`에 `gauge`(WI-192) + `scatter`(WI-193) 추가. 루즈
  series 타입에 `min`/`max` 추가.
- gauge는 기존 `value` 재사용(axis `"angular"`). scatter는 신규 `point` kind +
  핸들 값 union(`ChartHandleValue = number | {x,y}`) + axis `"free"`(move 커서)
  + `APPLY_BY_KIND.point`(2-셀 한 패치) + `ChartDataBinding.x/yColumn`.
- 보류 2종(radar/funnel)은 후속 WI 후보. 패널전용 5종은 본 DR로 의도 확정 —
  재론 시 본 표를 갱신.
