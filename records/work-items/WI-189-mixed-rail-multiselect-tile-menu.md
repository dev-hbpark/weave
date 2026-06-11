# WI-189 — 믹스드 레일 멀티셀렉트 + 타일 메뉴 행-구성 (rename / skip)

- 상태: DONE (2026-06-12)
- 출처: WI-183~188 믹스드-적용성 감사 ("믹스드 모드에 적용할수있는것들도
  확인해줘") — 대부분은 이미 전 플레이버 공통이었고, 정책으로 꺼져 있던
  두 후보(레일 멀티셀렉트 ⑨ / 타일 우클릭 ⑪)만 남았다.
- 결정: DR-125
- 선행: WI-184 (⑨ 멀티셀렉트 + ⑪ 타일 메뉴, slide-deck 측), WI-166/DR-114
  (EditorModeContext RailPolicy)

## 문제

1. **고아가 된 `attrs.skipped`**: `presentationStepIds()`는 플레이버와
   무관하게 `attrs.skipped`를 쇼에서 거른다. 그런데 skip을 토글하는 UI는
   slide-deck 레일에만 있었다 — slide-deck에서 건너뛰기 표시한 문서를
   mixed로 열면 **쇼에서 계속 빠지는데 해제할 방법이 없다**.
2. **셋-단위 큐레이션 부재**: mixed의 오버뷰 레일은 덱 큐레이션
   표면인데(섹션/토글/포커스), 큐레이션은 본질적으로 셋-작업(일괄 삭제 /
   일괄 재배열)임에도 `multiSelect: false`였다.
3. **게이트 모양 문제**: `RailPolicy.tileContextMenu: boolean` 하나가
   페이지-수명주기 행(newPageAfter / editBackground — 오버뷰 레일에서
   무의미)과 프레임-속성 행(rename / skipInShow — 플레이버 무관)을 함께
   묶고 있어, mixed에 rename/skip만 줄 방법이 없었다.

## 해결 (상세는 DR-125)

- `RailPolicy.tileContextMenu: boolean` → `tileMenuRows:
  ReadonlySet<TileMenuRow>` (행-구성 선언). `TileMenuRow = "rename" |
  "skipInShow" | "newPageAfter" | "editBackground"`.
- `OVERVIEW_RAIL` (mixed / canvas-board): `multiSelect: true` +
  `tileMenuRows = {rename, skipInShow}`. 셋 복제는 독립 게이트
  `duplicatePage: false`가 그대로 숨긴다.
- `PAGE_LIFECYCLE_RAIL`: `tileMenuRows = 4행 전부` (동작 불변).
- DesignPage 4개 wiring을 행별 `.has(...)` 게이트로 전환. ThumbnailPanel은
  정책-프리 유지(콜백 유/무 슬롯) + 루트 타일 메뉴-프리 방어 가드.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/document/editor-mode/types.ts` | `TileMenuRow` 타입 + `tileMenuRows` 필드 (tileContextMenu 대체) |
| `src/document/editor-mode/pieces/rail.ts` | OVERVIEW_RAIL multiSelect:true + 2행 / PAGE_LIFECYCLE_RAIL 4행 |
| `src/pages/DesignPage.tsx` | onRenamePage/onToggleSkip/onAddPageAfter/onEditBackground 행별 게이트 |
| `src/pages/ThumbnailPanel.tsx` | hasTileMenu에 `!entry.isRoot` 가드 + 주석 갱신 |
| `src/document/commands.ts` | **부수 버그 수정** — `weave.items.remove` 순서 데코레이터 (아래) |
| `src/document/editor-mode/editor-mode.test.ts` | 정책 테이블 2곳 갱신 |
| `src/document/commands.test.ts` | 패치 내림차순 순서 핀 테스트 신규 |
| `e2e/editor-mode-rail.spec.ts` | WI-189 스펙 2개 신규 (멀티셀렉트+셋삭제 / 타일 메뉴 행) |

## 부수 버그 — 멀티 삭제 undo가 형제 순서를 뒤바꿈 (신규 e2e가 검출)

`createRemoveItemsCommand`(vendored @agocraft/core)는 각 제거 패치의
`position`을 **사전-변이 문서** 기준으로 기록하고, undo는 인버스를 역순
재생한다 → 같은 부모의 형제 2개를 오름차순으로 제거하면 복원 시 순서가
뒤바뀐다 ([A,B,C,D] → 삭제{A,B} → undo → [A,C,B,D]). WI-184 셋 삭제
이후 줄곧 존재했으나 셋-삭제 undo를 핀하는 스펙이 없어 잠복.

- weave-측 수정: `weave.items.remove`를 데코레이터로 감싸 id를
  부모-내-인덱스 **내림차순**으로 정렬 후 위임 — 역순 재생이 오름차순
  삽입이 되어 원래 형제 순서가 정확히 복원된다. 전방 삭제는 id-기반이라
  순서 변경의 전방 영향 없음.
- 업스트림 kit 수정은 agocraft로 핸드오프: `HANDOFF-023` (agocraft
  `records/decision-handoffs/`).

## 검증 (Continuous Self-Verification)

- 단위: vitest **1198/1198 green** (신규 1 — removeItems 패치 순서 핀;
  editor-mode 정책 테이블 27 green).
- e2e 신규 2개 포함 `editor-mode-rail.spec.ts` **5/5 green**:
  ① mixed 멀티셀렉트 Shift범위/Cmd토글 + 셋 삭제 1-언두 복원(순서까지) +
  duplicate 부재, ② mixed 타일 메뉴 rename 커밋+언두 / skip 토글
  (`data-skipped`) + 인버스 행 + new/background/duplicate 행 부재.
- e2e 회귀: `slide-rail-workflow` 5/5 (⑨⑪ slide-deck 무회귀),
  `item-lock` green. `editor-shortcuts:271` / `multi-select-click:127`은
  DR-118 기지 networkidle 행(load-시점 `waitForLoadState` 행; :127은
  HEAD에서도 red 확인, :271은 retry pass — 환경 플레이크).
- tsc / biome / build / 게이트 5종 green.

## 잔여

- 비-슬라이드 섹션 타일은 메뉴 없음 유지 (덱 밖 프레임의 rename은 캔버스
  측 어포던스로 충분 — 필요 시 후속).
- 믹스드-감사의 나머지 결론(보류 항목 없음 — ⑦⑩⑯ 레일 수명주기 계열은
  DR-114 §4 승인 변경으로 설계상 N/A)은 DR-125 §감사 요약 참조.
