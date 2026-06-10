# WI-165 — 새 디자인 위자드: 미구현 flavor disabled ("Coming soon")

- **Status**: DONE
- **Date**: 2026-06-10
- **Origin**: 사용자 요청 — "디자인 생성 위자드에서 믹스드와 프레젠테이션을 제외하면
  아직 구현전이기때문에 disabled처리를 해야할듯해"

## Problem

새 디자인 위자드가 4개 flavor(mixed / slide-deck / canvas-board / doc-page)를
모두 생성 가능하게 노출하지만, 제품 표면이 준비된 것은 mixed와
slide-deck(Presentation)뿐이다. canvas-board / doc-page는 엔진은 상당 부분
동작하나(공유 page-bounded·infinite 인프라) 제품으로 제공할 단계가 아니다.

## Decision

1. **Registry-driven availability** (Rule 6 — 하드코딩 목록 금지):
   `DocFlavorMeta.availability: "available" | "coming-soon"` 필수 필드 추가.
   mixed/slide-deck = available, canvas-board/doc-page = coming-soon.
   소비자는 이 필드로 게이트하며 flavor 이름 목록을 들고 다니지 않는다.
2. **위자드**: coming-soon 타일은 `disabled` + tagline "Coming soon"으로 표시
   (숨기지 않음 — 로드맵 가시성 유지).
3. **디자인 시스템 (triage: 기존 프리미티브 extend)**: `RadioTile`은 Radix
   `RadioGroupItemProps`를 그대로 받으므로 `disabled`는 이미 동작 — 시각
   상태만 부재였다. `data-[disabled]` 변형 추가(opacity 0.45, hover lift 제거,
   cursor-not-allowed). 신규 프리미티브/토큰 아님 → 디자인 리뷰 비대상.
4. **DEV 전용 unlock**: e2e 10개 호출부가 canvas-board/doc-page를 위자드로
   생성해 엔진을 검증한다. `import.meta.env.DEV && localStorage
   "weave.dev.unlock-flavors" === "1"`일 때만 타일 재활성화 —
   `window.__weave*`와 동일한 DEV 게이트 규칙, 프로덕션 번들은 키를 읽지
   않는다. `e2e/helpers.ts prepareDesign`이 요청 flavor의 availability가
   coming-soon일 때만 키를 세팅(레지스트리 조회, 목록 하드코딩 없음).

## Verification (SVL)

- tsc clean(필수 필드라 레지스트리 4엔트리 전부 컴파일 강제), vitest 981/981,
  biome clean, 구조 게이트 4종 green.
- e2e 신규: `new-design.spec.ts` "wizard disables coming-soon flavors (WI-165)"
  — unlock 키 없는 실사용자 시점에서 mixed/slide-deck enabled,
  canvas-board/doc-page disabled + "Coming soon", enabled 타일 선택 정상.
- e2e unlock 경로: coming-soon flavor를 생성하는 spec 그룹
  (new-design / format-page-noun / repeat-add / canvas-pan-backswipe /
  handle-fsm-resize / history-shape-drag / present-poc) green.

## Pre-existing red spec 발견 — frame-handles.spec.ts:32

`resize handle drag changes the selected frame's geometry`가 일관 실패
(geometry delta 0). **WI-165와 무관함을 worktree 바이섹트로 입증**: 격리
worktree(`git worktree add`)에서 8c4af4f(pre-WI-163) → 851a1bf(pre-WI-159) →
efee815(WI-153 P5) → 3de04fc(**pre-WI-153 전체**) 전부 동일 실패. 배너
dismissal 키 사전 세팅으로도 실패(배너 오버랩 아님 — WI-164에서 찾은 hover
spec 실패 원인과는 다른 부류). 최소 WI-153 이전부터 red — 별도 슬라이스로
조사 필요(의심: 카메라 base-fit이 리사이즈 후 화면 박스를 재정규화하거나,
SE 핸들 드래그가 뷰포트 밖으로 나가 무시되는 WI-159 류 Playwright 제약).

## Files

- `apps/web/src/document/types.ts` — `DocFlavorMeta.availability` + 레지스트리 값
- `apps/web/src/pages/new-design/NewDesignWizard.tsx` — disabled 타일 + DEV unlock
- `packages/design-system/src/components/RadioTile.tsx` — `data-[disabled]` 스타일
- `apps/web/e2e/helpers.ts` — prepareDesign unlock 키(레지스트리 조회)
- `apps/web/e2e/new-design.spec.ts` — WI-165 disabled 검증 테스트
