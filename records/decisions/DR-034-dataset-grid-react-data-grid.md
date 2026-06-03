# Decision Record — DR-034 Spreadsheet dataset editor via lazy react-data-grid

## Metadata

| Field | Value |
|---|---|
| ID | DR-034 |
| Title | dataset 편집 패널의 손수 만든 `<table>` 를 **react-data-grid**(lazy 로드)로 교체해 엑셀급 입력 편의(셀 편집·키보드 이동·**드래그필**·셀 복붙)를 확보하고, 그 위에 **멀티셀(엑셀/시트 블록) 붙여넣기 → 전체 교체(헤더 자동 감지)** 를 배선한다. echarts 와 동일하게 `React.lazy + dynamic import` 로 **코드 스플리팅**한다. |
| Decision Level | **1 Project-local** — weave-side. react-data-grid 는 일반 npm 의존. agocraft 변경 0. |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-03 AskUserQuestion: 「lazy 데이터그리드 라이브러리」 + 「붙여넣기 첫 행 헤더 자동 감지」 명시 선택) |
| Status | **Accepted** |
| Decided on | 2026-06-03 |
| Triggering WI | [WI-077](../work-items/WI-077-chart-item-and-dataset.md) |
| Extends | [DR-design-029](../design-reviews/DR-design-029-chart-icon-and-section.md)(dataset 패널 — Phase 5 손수 table 대체) |

## Context

WI-077 Phase 5 의 dataset 편집기는 셀마다 `<input>` 한 칸씩, blur 커밋 — 외부(엑셀/시트) 데이터를
손으로 재입력해야 하고 드래그필/키보드 이동이 없었다. 사용자가 "외부 붙여넣기 + 엑셀식 드래그
채우기" 편의를 요청, 「lazy 데이터그리드 라이브러리」를 명시 선택.

## 라이브러리 평가 (3 게이트 + DOM/canvas + 라이선스)

| | 라이선스 | ESM/sideEffects | 렌더 | 내장 기능 | 결론 |
|---|---|---|---|---|---|
| **react-data-grid** ✅ | MIT | ESM, `sideEffects:["**/*.css"]`(트리쉐이크 OK) | **DOM**(가상 스크롤) | 셀 편집·키보드·셀 복붙·**드래그필(onFill)** | DOM → CSS변수 테마 + e2e 친화. lazy 청크 **13.8KB gz**+CSS 1.9KB. **채택** |
| glide-data-grid | MIT | ESM | canvas | 필/복붙/키보드 내장·고성능 | canvas → 테마는 JS theme, e2e 어렵고 작은 데이터엔 과함 |
| 자체구현 | — | — | DOM | 직접 전부 | 드래그필+범위선택 비용 큼 |

**react-data-grid(DOM, MIT)** 가 weave 의 CSS변수 테마 + 테스트 친화 패턴에 가장 맞는다.

## ⚠️ 버전 핀 (React 18 호환) — 함정

- `react-data-grid@7.0.0-beta.59`(latest)는 **peer `react ^19.2` 전용** → React 18.3.1 인 weave 에서
  **런타임 크래시**(다이얼로그 서브트리 붕괴)했다.
- **`7.0.0-beta.47` 로 핀**: peer `^18.0 || ^19.0` — React 18 동작 + 19 전방호환. (이후 베타는 19 전용.)
- 텍스트 에디터 export 명이 버전마다 다름(beta.59 `renderTextEditor` ↔ beta.47 `textEditor`); `DataGrid`
  는 beta.47 에서 **default export**. → 임포트는 버전에 맞춰 고정.

## Decision

1. **react-data-grid@7.0.0-beta.47 도입** (정확 핀, React-18 호환).
2. **코드 스플리팅**: react-data-grid + `lib/styles.css` 참조는 `document/dataset/DatasetGrid.tsx` 한
   파일에만. `DatasetEditorDialog` 가 `React.lazy(() => import("./DatasetGrid.js"))` 로만 도달 → 별도
   청크(`DatasetGrid-*.js` 13.8KB gz + CSS 1.9KB gz), 패널 열 때 온디맨드 로드. main 번들 영향 0.
3. **그리드 내장 활용**: 셀 인라인 편집(`textEditor`), 키보드 이동, 셀 복붙, **드래그필**(`onFill` →
   소스 셀 값 복사). 편집/필 → `onRowsChange` → 행 전체를 DatasetPayload 로 매핑해 `weave.dataset.update`.
4. **멀티셀 붙여넣기**(라이브러리 미지원분): 래퍼 `onPasteCapture` 에서 클립보드 TSV 파싱
   (`parseClipboardTable`). 동작은 선택 셀 유무로 분기 —
   - **앵커 붙여넣기**(셀 선택됨, `onSelectedCellChange` 로 추적): `pasteTableAt` 로 선택 셀부터
     블록을 써넣고 행/열 자동 확장, **나머지 셀 보존**(엑셀 동작). 헤더 감지 안 함(in-place fill).
   - **표 가져오기**(선택 없음): `clipboardTableToPayload`(**첫 행 헤더 자동 감지**)로 **전체 교체**.
   - 단일 셀 붙여넣기는 그리드 기본 동작에 위임.
5. **헤더 편집/열 삭제**는 `renderHeaderCell`(rename onBlur + × 제거), **행 삭제**는 말미 액션 컬럼.
   행/열 추가는 다이얼로그 버튼. 전부 `weave.dataset.update` 패치(History).
6. **Decommission**: 손수 만든 `<table>` 셀/헤더 입력 + 이제 미사용이 된 `setCell` 헬퍼 + 그 테스트 제거.

데이터 모델(DR-031)·렌더(DR-033)는 불변. 모든 입력은 dataset unit 으로 흘러 round-trip 무영향.

## Consequences

- **번들**: main 무변, lazy 청크 13.8KB gz(+CSS 1.9KB). 패널 처음 열 때 1회 로드 후 캐시.
- **공급망**: react-data-grid(MIT) 신규 의존. **beta 버전 핀** — 업그레이드 시 React 버전·export 명
  변화 주의(이 DR 의 함정 절 참조). React 19 업글 시 최신 beta 로 동반 이동 가능.
- **편의성**: 엑셀 복붙(블록) + 드래그필 + 키보드 이동 + 셀 복붙 확보 — 사용자 요청 충족.
- **테스트**: 순수 파서(`clipboard-import.test`)는 단위 테스트, 그리드 상호작용·붙여넣기 reflow 는 e2e
  (`chart-item.spec` — 디스패치한 paste 이벤트가 차트 reflow).
- 다이얼로그 변경: 손수 table 제거 → 그리드. selection-chrome/툴바 등 타 표면 영향 0.

## SOLID/GRASP gate (요약)

- 단일 책임: `dataset-store`(순수 변형/파서) · `DatasetGrid`(react-data-grid 어댑팅) ·
  `DatasetEditorDialog`(shell) 분리.
- 낮은 결합: react-data-grid 는 단 한 파일(lazy 경계)에만 의존 → main/타 모듈 비오염.
- DRY: TSV 파싱·헤더 감지·payload 변환은 `dataset-store` 순수 함수(단위 테스트).

## Dissent

자체구현(의존성 0)도 붙여넣기+키보드까지는 가능했으나 드래그필 비용이 커, 사용자가 라이브러리를
명시 선택. beta 핀 리스크는 함정 절에 박제. canvas 계열(glide)은 테스트/테마 비용으로 탈락.

## Links

- [WI-077](../work-items/WI-077-chart-item-and-dataset.md), [DR-031](DR-031-chart-kind-and-dataset-store.md)(데이터 모델), [DR-033](DR-033-chart-rendering-lazy-echarts.md)(렌더), [DR-design-029](../design-reviews/DR-design-029-chart-icon-and-section.md)
- 구현: `document/dataset/DatasetGrid.tsx`(lazy), `document/dataset/DatasetEditorDialog.tsx`(shell), `document/dataset/dataset-store.ts`(파서/변형)
- 선례(lazy): `document/domains/chart/echarts-renderer.tsx`(DR-033), `features/aku/MessageList.tsx`
