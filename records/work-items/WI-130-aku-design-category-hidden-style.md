# WI-130 — 디자인 스타일 피커를 카테고리 선택으로, 내부 스타일은 숨기고 seed 랜덤 적용

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-085 |
| Relates | DR-079(named style catalog, 부분 supersede) · DR-077(variation seed) · small-think DR-043(register) |

## Problem (operator, 2026-06-07)

> "콘텐츠에 대해서 글래스모피즘, 오로라 같은걸 선택하게 되어있는데 미래지향 saas같은 실제 카테고리를
> 선택하게 하고 내부적으로는 디자인 스타일을 카테고리 내부에서 랜덤 선택하도록하는게 좋겠어 미래지향을
> 선택하면 글래스모피즘이나 오로라가 자동 선택 적용되는 방식이야 세부 스타일은 숨겨줘"

DR-079가 12개 스타일을 개별 칩으로 노출 → 선택 단위가 너무 세분화. 사용자는 카테고리만, 구체 스타일은
시스템이 카테고리 내부에서 고르길 원함.

## Change

- **A** `agent/design-styles.ts` — 리졸버 추가:
  - `randomStyleInGroup(groupId, seed)` — `STYLES_BY_GROUP` 맵 + 기존 `pick(list, seed, 1)`로
    카테고리 내부 스타일 1개 선택(결정적, seed advance마다 re-roll).
  - `resolveStyleSelection(selectionId, seed)` — 카테고리→내부 랜덤, 레거시 스타일 id→직접, null→자동.
- **B** `AkuComposer.tsx` — 스타일 칩 12개 → 카테고리 칩 6개 + "자동". state `styleId`→`categoryId`.
  개별 스타일 UI 숨김. `DESIGN_STYLES` import 제거(미사용).
- **C** `agent/use-aku-agent.ts` — `styleById(styleId)` → `resolveStyleSelection(styleId,
  variationSeed)`. register는 해석된 구체 스타일 것으로 전송. import 교체.
- **D** `design-styles.test.ts` — 리졸버 테스트 5케이스 추가.

## Acceptance

- [x] 피커에 카테고리(미래지향/SaaS/브랜드/테크/생산성/친근) + 자동만 노출, 세부 스타일 숨김.
- [x] 미래지향 선택 → 내부적으로 글래스모피즘 또는 오로라 적용(seed 랜덤).
- [x] 동일 카테고리도 생성/재생성마다 내부 스타일 re-roll(variationSeed advance).
- [x] 레거시 구체 스타일 id 해석 호환(저장 세션 무손상).
- [x] DR-079 카탈로그/자동 디렉티브/variation/register transport 불변.
- [x] tsc 0 · biome clean.

## Verification (SVL gate — 2026-06-07)

- `npx vitest run src/features/aku/agent/design-styles.test.ts` → **13/13 green**(신규 5 포함).
- `npx vitest run src/features/aku` → **99/99 green**(15 files).
- `npx tsc --noEmit -p tsconfig.json`(apps/web) → 변경 파일 에러 0.
- `biome check`(4 changed files) → clean.
- 최종 렌더 스타일 충실도는 모델 의존 → DR-077 D6 다양성 하니스로 측정 권장.
