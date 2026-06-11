# DR-125 — RailPolicy 타일 메뉴 행-구성 + 오버뷰 레일 셋-큐레이션

- 상태: 채택 (2026-06-12)
- 작업: WI-189
- 선행: DR-114 (EditorModeContext; §4 RailPolicy, §6-G1 모든 모드 파일이
  키를 결정, §6-G3 불리언=패스스루 게이트), DR-120 (WI-184 ⑨⑪ —
  멀티셀렉트/타일 메뉴의 slide-deck 도입)

## 결정 1 — `tileContextMenu: boolean` → `tileMenuRows: ReadonlySet<TileMenuRow>`

타일 우클릭 메뉴는 성격이 다른 행들의 혼합이다:

| 행 | 쓰는 것 | 성격 |
|---|---|---|
| rename | `attrs.title` | 프레임-속성 — 플레이버 무관 |
| skipInShow | `attrs.skipped` | 프레임-속성 — `presentationStepIds`가 전 플레이버에서 거름 |
| newPageAfter | `weave.page.add` | 페이지-수명주기 — 오버뷰 레일에서 무의미 |
| editBackground | 선택+활성화 | 페이지-수명주기 — 〃 |

불리언 하나로는 mixed에 프레임-속성 행만 줄 수 없다. 불리언 2개
(`tileFrameAttrsMenu` / `tileLifecycleMenu`)는 행이 늘 때마다 불리언
스프롤로 간다. **행의 닫힌 목록을 선언하는 Set**이 §6-G3의 "불리언=
패스스루 게이트"의 자연스러운 일반화이고, 소비자(DesignPage)는 행별
`.has(...)`로 콜백 슬롯을 채우거나 비운다 — ThumbnailPanel은 계속
정책-프리("콜백 없음 → 행 없음"). 신규 행 = 리터럴 추가 + 패널 콜백
슬롯 + **모든 모드 파일이 결정**(§6-G1 성장 계약).

## 결정 2 — OVERVIEW_RAIL: `multiSelect: true` + `{rename, skipInShow}`

- **고아 `attrs.skipped` 해소가 직접 동기**: skip 필터는 플레이버-무관인데
  토글 UI는 slide-deck 전용이었다 → slide-deck에서 숨긴 문서를 mixed로
  열면 해제 불가. skipInShow 행 노출이 그 해제 어포던스다.
- 멀티셀렉트: 오버뷰 레일의 정체성은 덱 큐레이션이고 큐레이션은
  셋-작업이다(일괄 삭제/재배열). WI-184 ⑨의 "페이지-수명주기 전용"
  판단을 갱신 — 패널 구현은 이미 정책-프리라 게이트만 연다.
- **셋 복제는 자동으로 숨겨진 채 유지**: `onDuplicatePages`는 독립 게이트
  `duplicatePage: false`를 탄다. 게이트 직교성이 이 결정의 안전망.
- canvas-board도 OVERVIEW_RAIL을 공유하므로 함께 적용 — 같은 자유배치
  계열이고 같은 큐레이션 논리가 성립 (별도 분기 없음).
- 루트 타일(전체-디자인 엔트리)은 `!entry.isRoot` 가드로 메뉴-프리:
  타이틀 표시는 design.title이지 `attrs.title`이 아니고, 쇼 스텝도 아님.

## 결정 3 — 부수 버그 수정: `weave.items.remove` 순서 데코레이터

신규 e2e(믹스드 셋 삭제 1-언두 복원)가 잠복 버그를 검출: vendored kit의
`createRemoveItemsCommand`는 제거 `position`을 사전-변이 문서 기준으로
기록하고 undo는 인버스를 역순 재생 → 같은 부모 형제를 오름차순 제거하면
복원 순서가 뒤바뀐다 ([A,B,C,D] → 삭제{A,B} → undo → [A,C,B,D]).

- weave-측: 커맨드를 데코레이터로 감싸 id를 부모-내-인덱스 **내림차순**
  정렬 후 위임. 역순 재생 = 오름차순 삽입 = 정확한 복원. 전방 삭제는
  id-기반이라 무영향. 패치 방출 순서를 단위 테스트로 핀.
- 업스트림 kit 수정(기록 시점 위치를 순차 기준으로, 또는 패치를 부모별
  내림차순 정렬)은 **agocraft HANDOFF-023**으로 핸드오프 — kit이 고쳐져도
  데코레이터는 무해(이미 내림차순이면 정렬은 no-op).

## 대안 비교

- **mixed에 PAGE_LIFECYCLE_RAIL 일부 이식**: 레일의 수명주기 소유권은
  DR-114 §4의 승인된 플레이버 차이 — 행-구성으로 충분한데 정책 조각
  자체를 흔들 이유 없음. 기각.
- **불리언 2개 분할**: 행 추가마다 불리언 증식 + "어느 불리언인가" 분류
  논쟁 재발. 기각.
- **패널이 정책을 직접 읽기**: ThumbnailPanel 정책-프리 원칙(DR-114 §4 —
  DesignPage가 읽고 슬롯을 채움) 위반. 기각.
- **removeItems를 호출처(DesignPage)에서 정렬**: 모든 멀티-삭제 호출처
  (캔버스 Delete, 요소 메뉴, 레일 셋 삭제)에 흩어짐 — 커맨드 데코레이터가
  단일 지점. 기각.

## 잔여

- 비-Chromium 잔여 없음. 업스트림 kit 수정은 HANDOFF-023 추적.
