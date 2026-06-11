# WI-184 — 슬라이드 단위 키보드 워크플로 Batch 2 (레일 포커스·다중선택·우클릭)

- **Status**: DONE (2026-06-12)
- **Date**: 2026-06-11 ~ 2026-06-12
- **Decision Record**: DR-120
- **Origin**: WI-182 리서치(`docs/product/SLIDE_DECK_INTERACTION_SPEC.md` §4
  Batch 2, 항목 ⑦–⑪) — 갭 클러스터 2 "슬라이드 단위 키보드 워크플로":
  레일 키보드 내비·포커스 규칙·다중선택·PageUp/Down 전부 부재, 마우스 클릭이
  슬라이드 전환의 유일한 경로였음. Batch 1 = WI-183/DR-119.

## 범위 (전부 weave-측, agocraft 재vendor 불필요)

| # | 동작 | 구현 |
| --- | --- | --- |
| ⑦ | 레일 포커스 모델: 타일 ←→↑↓ = 활성 슬라이드 이동 + DOM 포커스 동행 | `ThumbnailPanel.handleTileArrowKey` — 필름스트립 의미론(레일 포커스 이동 = 슬라이드 전환), 끝에서 클램프(랩 없음), disabled 타일 건너뜀, `stopPropagation`으로 캔버스 넛지 격리 |
| ⑧ | PageUp/PageDown = 이전/다음 슬라이드 (캔버스 포커스에서도) | 전 세션 완료 (DesignPage 윈도 키다운, office 클램프) |
| ⑨ | 레일 다중선택 (Shift 범위 / Cmd 토글) + 세트 복제·삭제·드래그 재정렬 | 패널-로컬 `multiSelected` Set + `anchorId`; **`weave.pages.duplicate` 신규 커맨드(1 트랜잭션)**; 세트 삭제 = `weave.items.remove` 배치 + ≥1페이지 가드; `reorderSet` 순수 함수(연속 블록 이동) |
| ⑩ | "+" 삽입 위치 = 현재 슬라이드 뒤 | 전 세션 완료 (`weave.page.add` afterId) — stale 주석 2곳 이번에 정정 |
| ⑪ | 레일 우클릭: Skip(쇼에서 건너뛰기) + rename | radix `ContextMenu`(디자인 시스템 재사용) + `attrs.skipped`(`presentationStepIds` 필터) + `EditableText` 인라인 rename(`attrs.title`) — 둘 다 `weave.item.update` 1 패치 |

## 핵심 설계 결정 (상세는 DR-120)

- **⑨ 한-트랜잭션 세트 복제**: 호스트 루프(N 트랜잭션 = N 언두)는 History
  계약 위반 → `weave.pages.duplicate` 합성 커맨드. kit 배치 클론(offset 0,
  입력 순서로 클론 id 반환) + `document.attrs` order 패치 1장으로 각 클론을
  소스 바로 뒤에 인터리브. kit이 누락 id를 조용히 `continue`하면 소스→클론
  인덱스 정렬이 깨지므로 **전체 id 사전 검증**. `PAGE_EXCLUDED` 등재 —
  activatesPage 레일-패리티 채널(WI-169)은 정확히 1개의 새 페이지 id를
  요구하므로 에이전트 경로는 `weave.page.duplicate` 유지.
- **⑨ 다중선택 모델(PPT)**: Shift = 앵커(`anchorId ?? selectedId`)에서 범위,
  Cmd = 토글(빈 세트는 활성 페이지에서 시드 — 첫 Cmd+클릭이 "현재 + 이것"),
  평클릭/화살표 = 세트 붕괴 + 재앵커. 풋터 액션은 `isMultiSelected`
  (size>1 && has) 타일에서 세트로 동작. 드래그 페이로드 무변경(인덱스만) —
  세트는 드롭 시점에 패널 상태에서 읽음.
- **⑪ `attrs.skipped` ≠ `presentable:false`**: slide-deck 레일은
  nonSlideSection=false라 `presentable:false`면 타일이 **사라짐**. PPT Hide
  Slide 의미론(레일에 남고 쇼만 건너뜀)은 새 attr가 필요. 필터 지점은
  `presentationStepIds(design)` 단일 함수 — PresentPage:~205 카메라 스텝만
  교체, 덱/레일은 `effectivePresentationOrder` 유지.
- **⑪ rename**: 디자인 시스템 `EditableText` 재사용(새 프리미티브 없음 →
  디자인 리뷰 불요). radix가 메뉴 닫힘 시(exit 애니메이션 **후**) 트리거로
  포커스를 복원해 rename 필드를 즉시 blur시키는 함정 →
  `onCloseAutoFocus`에서 rename 진입 시에만 `preventDefault`. rename 중
  타일 `draggable` 정지(contenteditable 텍스트 드래그-선택 충돌).
- **RailPolicy 확장**: `multiSelect` + `tileContextMenu` —
  OVERVIEW_RAIL false / PAGE_LIFECYCLE_RAIL true. 패널은 정책 무지(호스트가
  props를 채움 — DR-114 "no prop → no render").

## 검증 (Continuous Self-Verification)

- 단위: presentation-order 14/14 (`reorderSet` 5건 + `presentationStepIds`/
  `isSkippedFrame` 3건), commands `weave.pages.duplicate` 4건(1-트랜잭션
  패치 형상·offset 0·사전 검증·order 패치 생략), editor-mode 테이블 26/26,
  agent-surface 커버리지 7/7 — 전체 vitest **1162/1162 green**,
  `tsc --noEmit` clean.
- e2e `slide-rail-workflow.spec.ts` **5/5** (⑩⑦⑨⑪⑧): 화살표 워크+클램프+
  포커스 동행, Shift 범위/Cmd 토글, 세트 복제 6타일 인터리브 순서 + **1회
  Cmd+Z 전체 롤백**, 세트 삭제 + 생존자 활성화, 우클릭 rename(타이핑+Enter+
  언두) + skip 토글(라벨 반전·data-skipped·언두 2단).
- e2e 디버깅에서 발견: 연속 `item.attrs#같은id` 패치는 DR-017 ADR-D 500ms
  머지 윈도에 접혀 1 언두가 됨 — 제품 의도대로(문서화됨), 테스트가
  600ms 대기로 윈도를 넘김.
- 알려진 env red(networkidle 행)는 vendored sprite-engine `@fs` 기준선
  (WI-153 기록) — 본 변경 무관.

## Decommission Sweep

- ⑩ stale 주석 2곳 정정(onAddPage prop 독스트링 + "+" 타일 주석 — "덱
  끝에 추가" 서술을 WI-184 ⑩ 사실로 교체).
- PresentPage:487 주석의 `effectivePresentationOrder` 참조를
  `presentationStepIds`로 갱신.
- 삭제된 코드 없음(순수 추가 + 주석 정정) — 제거 대상 테스트 없음.

## 잔여 (Batch 2 스코프 밖)

- Batch 3 (스펙 §4 항목 12–18): paste 좌표 D-5, smart duplicate, Cmd+G,
  요소/빈 슬라이드 우클릭 표준 메뉴, OS 이미지 paste, 줌-투-셀렉션.
- 스펙 미확인 항목: 이미지 기본 비율 잠금, 드래그 임계값. (Shift+클릭
  토글 질문은 ⑨에서 Shift=범위/Cmd=토글로 해소.)
- 우클릭 메뉴의 New/Duplicate/Delete/배경 항목(스펙 §4 표의 잔여)은
  Batch 3 ⑮⑯ 표준 메뉴 작업에서 통합 예정.
