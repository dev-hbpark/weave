# DR-120 — 슬라이드 레일 키보드 워크플로(Batch 2) 시맨틱 + 레일 정책 확장

- Status: ACCEPTED — WI-182 권고안 사용자 승인("권고안으로 진행해줘") +
  WI-184 구현 완료 (2026-06-12)
- Date: 2026-06-12
- Related: WI-182/WI-184, `docs/product/SLIDE_DECK_INTERACTION_SPEC.md` §4
  Batch 2, DR-114 (EditorModeContext — RailPolicy 본 DR이 확장), DR-119
  (Batch 1), WI-155 (단일 페이지 복제 — 세트 복제의 선례), WI-169
  (activatesPage 레일-패리티 채널 — PAGE_EXCLUDED 사유), WI-072
  (presentable 덱 멤버십 — skipped와의 경계), DR-017 ADR-D (히스토리 머지
  윈도 — e2e에서 재확인), DR-design-003 (EditableText), DR-design-011/013
  (ContextMenu)

## 결정 1 — 레일 포커스 모델 = 필름스트립 (⑦)

**레일 포커스를 이동하는 것이 곧 활성 슬라이드를 바꾸는 것**이다 (PPT/
Keynote 합의). 별도의 "포커스만 이동, Enter로 활성화" 2단계 모델은 기각 —
스펙 §1e 포커스 규칙(5/5 합의: 레일 포커스→화살표=슬라이드, 캔버스
선택→화살표=넛지)이 단일 동작을 요구한다.

- 활성화 버튼의 ←→↑↓ 모두 바인딩(레일은 가로지만 스펙은 ↑/↓ 명명 — 자연
  쌍을 함께). 끝에서 클램프(랩 없음, office 동일), disabled(dim/iso 게이트)
  타일은 건너뜀.
- DOM 포커스가 활성화를 따라간다(연타로 계속 걸을 수 있게) +
  `scrollIntoView({block/inline: "nearest"})` 옵셔널 콜(jsdom 안전).
- `e.stopPropagation()`이 경계: DesignPage의 윈도 키다운(화살표 = 캔버스
  넛지)은 버블 단계 리스너라 합성 이벤트의 stopPropagation으로 차단된다.
  레일에 포커스가 있는 동안 화살표는 절대 캔버스 아이템을 움직이지 않는다.

## 결정 2 — 레일 다중선택 모델 (⑨)

PPT 필름스트립 모델 채택: **Shift = 앵커에서 범위, Cmd/Ctrl = 토글, 평클릭
= 세트 붕괴 + 재앵커.**

- 앵커 = 마지막 평/Cmd-클릭 타일(`anchorId ?? selectedId` 폴백). 앵커가
  없으면 Shift+클릭은 평 활성화로 폴스루.
- 빈 세트에서 첫 Cmd+클릭은 활성 페이지를 시드 — "현재 + 이것"으로 읽힘.
  토글-ON은 그 타일을 활성화, 토글-OFF는 활성 페이지를 건드리지 않음.
- `isMultiSelected = size > 1 && has(id)` — 1개 세트는 다중선택이 아님.
- 세트는 **패널-로컬 임시 UI 상태**(호스트는 활성 페이지만 소유). stale
  id는 무해(모든 읽기가 live entries와 교집합).
- 드래그 재정렬: 세트 멤버를 드래그하면 전체가 **덱 순서의 연속 블록**으로
  이동(`reorderSet` — 클릭 순서 아님). 단일 `reorder`의 splice 의미론
  미러: from<to는 타깃 **뒤**, from>to는 **앞**. 세트 멤버 위 드롭 = no-op.
  드래그 페이로드 형식 무변경(인덱스만) — 하위호환.

## 결정 3 — `weave.pages.duplicate` 합성 커맨드 (⑨, History 계약)

세트 복제는 **하나의 트랜잭션**이어야 한다(1 Cmd+Z = 전체 롤백). 호스트가
`weave.page.duplicate`를 N회 루프하는 안은 N 언두 스텝이라 기각.

- 구현: kit `createDuplicateItemsCommand`(offset 0) 배치 클론 — 클론 id를
  입력 순서로 반환, `item.create` 패치는 자기완결이라 합성 안전 — 위에
  `document.attrs` order 패치 1장(각 클론을 소스 바로 뒤에 인터리브,
  `effective.flatMap`).
- **전체 id 사전 검증**: kit은 누락 id를 조용히 `continue`하므로 그대로
  쓰면 소스→클론 인덱스 정렬이 어긋난다(잘못된 타일 활성화). empty-input /
  item-not-found / not-a-page를 먼저 fail.
- presentable:false 전용 세트는 order 패치 생략(덱에 소스 없음).
- **에이전트 표면**: `PAGE_EXCLUDED` — WI-169 activatesPage 채널은 정확히
  1개의 새 페이지 id를 요구. 에이전트는 `weave.page.duplicate` 사용. free
  표면(`tools:"all"`)에는 노출되므로 `WEAVE_COMMAND_SCHEMAS` 등재는 필수
  (커버리지 게이트가 검증).
- 세트 삭제는 기존 `weave.items.remove` 배치로 충분(신규 커맨드 불요).
  ≥1페이지 불변식은 UI에서 가드(`wouldEmpty` disable — 단일 삭제의
  마지막-페이지 가드와 동일 규칙), 이웃 선택은 호스트(첫 삭제 슬롯 이후의
  첫 생존자 ?? 마지막 생존자).

## 결정 4 — `attrs.skipped` = PPT Hide Slide (⑪)

쇼에서 건너뛰는 슬라이드는 **새 attr `skipped`**로 표현한다.
`presentable:false`(WI-072) 재사용은 기각:

| | `presentable: false` | `attrs.skipped: true` |
| --- | --- | --- |
| 덱(레일) | 제거 — 비-슬라이드 섹션으로 이동 | **잔류** (딤 + 번호 취소선) |
| slide-deck 레일 | nonSlideSection=false → 타일 **소멸** | 잔류 |
| 쇼 스텝 | 제외 | 제외 |

- 필터 지점은 단일 순수 함수 `presentationStepIds(design)` =
  `effectivePresentationOrder` − skipped. **쇼(PresentPage 카메라 스텝)만**
  이 함수를 쓰고, 덱/레일/재정렬은 `effectivePresentationOrder` 유지.
- 토글/rename 둘 다 기존 `weave.item.update`(attrs 머지) 1 패치 — 신규
  커맨드 없음, 각각 언두 가능.

## 결정 5 — 우클릭 메뉴 + 인라인 rename (⑪, 디자인 시스템 재사용)

Design System Triage: **재사용** — radix `ContextMenu*`(DR-design-011/013)
+ `EditableText`(DR-design-003) 모두 기존 프리미티브. 새 프리미티브/토큰
없음 → 디자인 리뷰 불요.

- 메뉴 항목: "이름 바꾸기" / skipped에 따라 "프레젠테이션에서 건너뛰기" ↔
  "프레젠테이션에 포함". 콜백 부재 또는 disabled 타일이면 메뉴 자체 미장착
  (Radix Root는 DOM 무출력 — 레일 flex 레이아웃 불변).
- **radix 포커스 복원 함정**: 메뉴 닫힘 시 radix는 exit 애니메이션 **후**
  트리거로 포커스를 복원한다. rename 진입 직후 `focusEnd()`(0ms 디퍼)로
  캐럿을 놓아도 그 복원이 나중에 도착해 필드를 blur → rename 모드 즉시
  종료(e2e가 검출). 해결: `onCloseAutoFocus`에서 **rename 진입 시에만**
  `preventDefault` — 다른 dismiss는 기본 복원 유지.
- rename 종료는 onBlur 단일 경로(Enter는 onEnterCommit, Esc는 EditableText가
  텍스트를 되돌린 뒤 blur — commit이 no-op이라 가드 불요하나 빈 문자열/
  무변경 가드는 onCommit에 둠). rename 중 타일 `draggable=false`
  (contenteditable 텍스트 드래그-선택과 타일 드래그 충돌).

## 결정 6 — RailPolicy 확장 (DR-114 v2 증보)

`multiSelect` + `tileContextMenu` 부울 2개 추가 — 둘 다 페이지 라이프사이클
어포던스로 분류:

| | OVERVIEW_RAIL (mixed/canvas-board) | PAGE_LIFECYCLE_RAIL (slide-deck/doc-page) |
| --- | --- | --- |
| multiSelect | false | true |
| tileContextMenu | false | true |

패널은 정책을 모름(DR-114 §2b) — DesignPage가 정책을 읽어 props를
채우거나 비움("no prop → no render"). 소비자 flavor 비교 0건 유지.

## 재확인 — DR-017 ADR-D 머지 윈도 (정보성)

e2e 디버깅에서: 같은 아이템에 대한 연속 `item.attrs` 패치(skip ON→OFF)는
500ms `historyMergeWindowMs` 안이면 **1 언두 엔트리로 접힌다**. 이는
DR-017 ADR-D가 문서화한 의도된 동작(드래그 60Hz 폴딩의 부수 효과)이며
인간 속도의 메뉴 재오픈은 윈도를 넘는다 — 제품 변경 없음, 테스트가 600ms
대기로 우회. 세션-스코프 머지 네임스페이스는 DR-017의 기존 future-work로
잔존.
