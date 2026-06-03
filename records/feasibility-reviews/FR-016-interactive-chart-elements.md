# FR-016 — Interactive chart elements (real text items + selectable series + per-element overrides)

| Field | Value |
|---|---|
| ID | FR-016 |
| Date | 2026-06-03 |
| Work item | WI-078 (interactive-chart-elements) — *생성 예정* |
| Verdict | **FEASIBLE WITH TRADE-OFFS** (B 하이브리드 범위) |
| Status | Draft (검토용) |

## Question

차트를 "데이터에서 파생된 불투명 그림"에서 **조작 가능한 요소들의 묶음**으로 바꿀 수 있는가:
1. 차트 내부 텍스트(축 레이블·범례·제목)를 **실제 weave `text` 아이템**으로,
2. 막대/시리즈를 **클릭해 선택·디테일 조작**(강조용 두께·색, 도넛 원점 거리/explode 등),
3. 데이터(값·레이블 텍스트)는 **데이터셋에 자동 반영**.

사용자 확정(2026-06-03): **B 하이브리드** + 바인딩 경계 = "데이터(값/레이블)→데이터셋, 표현
(색·두께·도넛 오프셋·강조)→chart per-element override". 자유 이동/회전은 비범위.

## 근본 긴장 (왜 TRADE-OFFS 인가)

차트는 **데이터셋 단일 진실원에서 파생된 뷰**다. 요소를 편집 가능하게 만들면 진실원이 둘이 되어
동기화가 필요하다. 핵심 난점 셋:

1. **데이터-바인딩 vs 표현 속성 분리** — 값/레이블 텍스트/시리즈명 = 데이터(↔데이터셋), 색/두께/
   도넛오프셋/강조 = 표현(데이터셋에 없음 → chart 에 per-element override 저장, **신규 개념**).
2. **재생성 vs 수동 편집** — 데이터 변경 시 마크/레이블 재생성 필요하나 사용자 override 보존 필요
   (Figma 인스턴스 override 류). override 를 데이터 인덱스가 아니라 **안정 키**로 묶어야 행 추가/삭제에
   견딘다.
3. **기존 결정 일부 되돌림** — DR-031(chart=leaf)→컨테이너 승격, DR-033(ECharts 가 텍스트 렌더)→
   텍스트는 실제 아이템.

## Findings (B 하이브리드)

| 영역 | 상태 |
|---|---|
| **시리즈/요소 클릭 선택** | **가능** — ECharts `chart.on('click', p => p.seriesIndex/dataIndex/componentType)`. 데이터 마크를 weave 아이템화하지 않고도 "무엇을 클릭했는지" 식별 가능. |
| **per-element 표현 override** | **가능** — ECharts `series.data[i] = { value, itemStyle:{ color, borderWidth } }`(per-datum 색/두께), 파이 `selectedMode`+`selectedOffset`(원점 거리/explode). override 를 chart attrs 에 저장 → option 빌더가 주입. round-trip 무영향. |
| **실제 text 아이템 레이블** | **가능하나 좌표 동기화가 fragile** — ECharts 자체 축/범례 텍스트를 끄고, weave `text` 자식 아이템을 레이블 위치에 배치. 위치는 ECharts `convertToPixel({xAxisIndex},i)` / 레이아웃 모델에서 취득 → 렌더 후 1패스 + 리사이즈/데이터 변경 시 재계산. **지터/지연 리스크**(렌더 완료 후 위치 취득 타이밍). |
| **텍스트→데이터셋 동기화** | **가능** — 레이블 text 아이템 ↔ 데이터셋 셀(카테고리/열이름) 매핑. 텍스트 편집 커맨드가 `weave.dataset.update` 도 동반(또는 양방향 바인딩 단일 진실원=데이터셋, text 아이템은 파생 표시 + 편집 위임). |
| **chart 를 컨테이너로** | **가능하나 비용** — 현재 container/drill/hover 는 `kind==="frame"` 하드 게이트(selection-context, use-hover-context). chart 를 frame-like 컨테이너로 승격하거나, 레이블 text 를 같은 frame 의 "링크된 형제"로 두는 두 방향. 전자는 일관성↑·비용↑. |
| **데이터 마크 값 편집** | **가능** — 클릭 선택 → 값 편집 패널/핸들 → `weave.dataset.update`. 막대 높이 드래그=value 는 후속(핸들 수학). |

## Trade-offs / 한계

- **레이블 위치 동기화**: ECharts 내부 레이아웃에 weave 텍스트 아이템을 맞추는 건 본질적으로 추종형
  (render→measure→place). 완벽한 프레임-퍼펙트가 아니며 리사이즈 중 한 프레임 지연 가능. 대안:
  weave 가 차트 레이아웃(여백/축 영역)을 고정 규약으로 잡아 위치를 직접 계산(ECharts grid 를 weave 가
  통제) — 정합성↑, 차트 종류별 계산 필요.
- **override 안정 키**: per-element override 는 dataIndex 가 아니라 카테고리명/시리즈명 기반 키로 저장해야
  행 추가·정렬·붙여넣기에 견딘다(데이터그리드 편집과 충돌 방지).
- **양방향의 단일 진실원 선택**: 텍스트는 "데이터셋이 진실, text 아이템은 파생 + 편집 위임"이 안전
  (이중 진실원 회피). 즉 text 아이템 편집 = 데이터셋 커맨드로 라우팅.
- **자유 조작 미지원**: 마크 자유 이동/회전/삭제는 데이터 의미가 불명이라 비범위(사용자 합의). 삭제=행
  삭제 같은 매핑은 후속 검토.
- **C(완전 네이티브) 미채택**: 차트 엔진 재구현+override+재생성 충돌 비용이 과대 → 점진적 B 우선.

## Verdict

**FEASIBLE WITH TRADE-OFFS.** B 하이브리드 범위(실제 텍스트 아이템 레이블 + ECharts 이벤트 기반
시리즈 클릭 선택 + per-element 표현 override + 데이터 양방향)는 ECharts 의 per-datum 스타일/이벤트/
좌표 API 로 성립한다. 핵심 트레이드오프는 (1) 레이블 좌표 추종 동기화의 fragility, (2) override 안정-키
+ 재생성 보존, (3) 텍스트의 단일-진실원(데이터셋) 라우팅 — 셋을 Engineering Plan 에서 못박아야 한다.
데이터 모델(DR-031)·dataset(DR-034)은 불변, round-trip 무영향.

## Links

- 결정: DR-035 (interactive chart elements — *작성 예정*)
- 관련: DR-031(데이터 모델), DR-033(ECharts 렌더), DR-034(dataset grid), FR-015
- 후속: `/solid-grasp`(override 레지스트리/바인딩 경계), design-system triage(요소 선택 크롬·편집 패널)
