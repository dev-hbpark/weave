# WI-194 — 페이지-바운드 모드의 덱 소스 = 루트 직속 페이지만 (DeckPolicy)

- Status: DONE (2026-06-12)
- Created: 2026-06-12
- Owner: weave
- Decision: DR-127
- Related: WI-072 (deck membership), WI-153 (page-bounded editing), WI-166/DR-114 (EditorModeContext), WI-180 (mode-scoped add), WI-184/185 (slide rail batches), WI-189/DR-125 (mixed rail)

## Problem

사용자 보고: "믹스드와 프레젠테이션(slide-deck)의 하단 패널이 같아진 것 같다."

전수 확인 결과 RailPolicy 자체는 정상 분기(OVERVIEW vs PAGE_LIFECYCLE)였으나,
**덱 후보 수집이 모드 무관·깊이 무관**이라는 근본 공백이 있었다:

- `collectPresentationIds`(Phase 11)는 어느 깊이든 모든 `frame`을 슬라이드로
  수집하고 `presentable: false`만 제외한다.
- slide-deck에서 "페이지 내부 프레임 = 자동 제외(그룹 취급)" 로직은 코드에
  존재한 적이 없다. Aku 에이전트만 프롬프트로 `presentable:false` 스탬프를
  권고받을 뿐, UI 경로(weave.item.add / weave.items.group / paste)는 무방비.
- 최근 작업이 이 공백을 일상 경로로 만들었다: WI-180(툴바 add → 활성 페이지
  내부), WI-185 Cmd+G(`weave.items.group`이 래핑 frame 생성, presentable
  스탬프 없음) → slide-deck 레일이 믹스드처럼 "모든 프레임이 타일"로 오염.
- 더 나쁜 점: slide-deck 레일은 의도적으로 deck 토글/그룹 섹션이 없으므로
  (DR-114 §4) 오염된 타일을 빼낼 UI 복구 수단이 없다.

라이브 재현(2026-06-12): slide-deck, 페이지 1 + 페이지 내부 프레임 1 추가 →
레일 타일 2개, 프레젠테이션 스텝에도 포함.

## Decision (DR-127, option B)

생성 시점 스탬핑(A)이 아닌 **읽기 시점 구조 필터(B)**:

- `EditorModeContext`에 `deck: DeckPolicy` 추가 (DR-114 §6 growth contract —
  소비처 마이그레이션과 같은 변경에서 REQUIRED 키로).
- 페이지-바운드 모드(slide-deck / doc-page)의 덱 소스 = **루트 직속 frame만**,
  `presentable` 무시(구조적: 페이지=아트보드=슬라이드; mixed에서 넘어온 stale
  `presentable:false`가 보이지 않는 페이지를 만드는 역버그 차단).
- 자유 배치 모드(mixed / canvas-board)는 기존 WI-072 모델 그대로
  (`collectPresentationIds` + deck 토글 + 그룹 섹션).

## Scope

- `presentation-order.ts`: `collectRootPageIds`, `effectiveDeckOrder`,
  `presentationStepIds`에 collector 주입(기본값 = 기존 동작).
- `editor-mode/types.ts`: `DeckPolicy` (collectCandidateIds / childOwnsScene /
  collectNonStepSceneIds) + `deck` 키.
- `editor-mode/pieces/deck.ts`: `FULL_DECK` / `PAGE_DECK`.
- 4 modes 배선.
- DesignPage: rail/active-page 소스를 정책 주도 덱 순서로.
- ThumbnailPanel: `deckOrder` 데이터 prop (정책은 여전히 모름).
- PresentPage + PresentFrameTree: 스텝/씬/inline-render 판정을 DeckPolicy로
  (PAGE_DECK에서 중첩 프레임은 own-scene이 아니라 부모 씬에 inline —
  이걸 빠뜨리면 슬라이드에 구멍).

## Out of scope / follow-up

- `link-section.tsx`의 점프 타깃 목록은 여전히 `collectPresentationIds` —
  slide-deck에서 중첩 프레임이 링크 타깃으로 노출되고, PAGE_DECK 씬이 없는
  중첩 프레임으로의 기존 jump-camera 링크는 dangle. 툴바 섹션 레지스트리에
  정책 주입이 필요해 별도 WI로.
- 진짜 협업 머지(WI-028)와 무관.

## Verification (2026-06-12 — all green)

- 유닛: editor-mode 정책 테이블 + presentation-order collector — 전체 vitest
  113 files / 1219 tests green.
- e2e `deck-source.spec.ts` 4/4: slide-deck 중첩 add 레일 불오염 + Cmd+G
  래퍼 불오염 + mixed 무회귀(중첩 프레임 = 타일, WI-072) + slide-deck
  present 중첩 프레임 인라인 렌더(스텝/논슬라이드 씬 없음).
- 기존 `editor-mode-rail.spec.ts` + `slide-rail-workflow.spec.ts` +
  `present-nonslide-frame.spec.ts` 12/12 green.
- `tools/check_editor_mode_boundary.sh` OK, `tsc --noEmit` 0, biome(변경
  파일) clean.
