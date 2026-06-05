# WI-101 — fix: 썸네일 포함/제외(DeckGlyph) 버튼 클릭이 활성화 버튼에 가로채짐

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-06) |
| Owner | hbpark |
| Relates | WI-072(덱 토글), WI-100(그룹 눈 버튼), WI-039(전체커버 활성화 버튼) |

## Problem (operator, 2026-06-06)

하단 썸네일의 포함/제외(DeckGlyph) 버튼을 눌러도 **아무 반응 없음 — 슬라이드·그룹 동일**.
(WI-100의 그룹 눈 버튼은 정상 확인.)

## Root cause

각 타일은 `<div role=group relative>` 안에 **전체를 덮는 활성화 버튼**(`absolute inset-0 z-0`,
프레임 선택용)과 footer의 DeckGlyph 버튼을 형제로 둔다. footer DeckGlyph는 **static(미배치)**
이라 스택 순서상 positioned(z-0) 활성화 버튼 **아래**에 깔린다 → 클릭이 활성화 버튼에 먹혀
"프레임 선택"만 되고 `onToggleSlide`는 발화하지 않음. 포커스 눈 버튼은 `absolute`(positioned)
라 위로 떠서 정상 동작했던 것.

## Fix

슬라이드·그룹 양쪽 DeckGlyph 버튼에 `relative z-10` 추가 → 활성화 버튼(z-0) 위로 올려 클릭
경로에 포함. (포커스 눈이 동작한 것과 동일 원리.) 모델/명령 변경 없음, CSS 스택 수정.

## Acceptance

- 슬라이드 타일 DeckGlyph 클릭 → 그룹으로 제외(덱에서 빠짐). ✔
- 그룹 타일 DeckGlyph 클릭 → 슬라이드로 포함. ✔

## Verification (2026-06-06, SVL gate)

- Typecheck clean; biome clean(ThumbnailPanel.tsx).
- e2e(`thumbnail-panel.spec.ts`, WI-100에서 추가): 슬라이드 제외→tile 수 2→1, 재포함→1→2.
  이 카운트 단언이 곧 본 버그의 회귀 가드(수정 전엔 클릭이 먹혀 실패). CI에서 수행.
