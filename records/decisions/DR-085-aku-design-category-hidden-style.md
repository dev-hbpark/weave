# DR-085 — 디자인 스타일 피커: 카테고리 선택 + 카테고리 내부 스타일은 숨기고 seed 랜덤 적용

- **Date:** 2026-06-07 · **Status:** Accepted · **WI:** WI-130
- **Supersedes (부분):** DR-079 D1의 "각 스타일을 **개별 선택**" 결정 — 피커 노출 단위를 스타일에서
  **카테고리(STYLE_GROUPS)**로 올린다. DR-079의 카탈로그(12 스타일·recipe·register), 자동
  content-aware 디렉티브(`autoStyleDirective`), within-style variation(`variationLine`),
  register transport(DR-043)은 **그대로 유지**.
- **Relates:** DR-079(named style catalog), DR-077(variation seed/jitter), small-think DR-043,
  Rule 6(레지스트리 분기 — `STYLES_BY_GROUP` 맵), 루트 CLAUDE.md(Decommission/주석 갱신)
- **Operator directive (2026-06-07):** 콘텐츠에 대해 글래스모피즘·오로라 같은 걸 직접 고르게 되어
  있는데, **"미래지향 SaaS" 같은 실제 카테고리를 선택**하게 하고 **내부적으로는 디자인 스타일을
  카테고리 안에서 랜덤 선택**하면 좋겠다. 미래지향을 고르면 글래스모피즘이나 오로라가 자동 선택·적용.
  **세부 스타일은 숨겨라.**

## Context

DR-079는 6개 use-case 그룹 각각의 2개 스타일을 **개별 칩**으로 노출했다(글래스모피즘/오로라,
벤토/미니멀리즘…). operator는 선택 단위가 너무 세분화돼 있다고 보고, 사용자에게는 **카테고리**만
고르게 하고 구체 스타일은 시스템이 카테고리 내부에서 고르길 원한다. 카탈로그/recipe 자체는 유지 —
**노출·선택 단위만** 스타일 → 카테고리로 변경.

## Decision

### D1 — 피커는 카테고리 단위 (`AkuComposer`).
스타일 칩 12개 → **카테고리 칩 6개**(미래지향 / SaaS / 브랜드 / 테크 / 생산성 / 친근) + "자동".
composer state `styleId` → `categoryId`(보유 값 = STYLE_GROUPS id 또는 null=자동). 개별 스타일은
UI에서 완전히 숨김. `onSend`의 `styleId` opt 이름은 유지(다운스트림 contract) — 이제 **선택 id**
(카테고리 또는 레거시 스타일)를 운반.

### D2 — 카테고리 → 구체 스타일은 seed 랜덤으로 해석 (`design-styles.ts`).
- `randomStyleInGroup(groupId, seed)` — `STYLES_BY_GROUP` 맵에서 그룹의 스타일들을 꺼내 기존
  `pick(list, seed, 1)`로 1개 선택. **결정적(deterministic)이되 seed가 generation마다 증가**
  하므로 동일 카테고리도 매 생성/재생성마다 내부 스타일이 re-roll.
- `resolveStyleSelection(selectionId, seed)` — 카테고리 id → 내부 랜덤 스타일, **레거시 구체
  스타일 id → 그 스타일 직접**(저장된 세션 호환), null → 자동.

### D3 — 해석 위치는 hook (단일 소스, 재생성도 re-roll).
`use-aku-agent.ts` `runTurn`에서 `styleById(styleId)` → `resolveStyleSelection(styleId,
variationSeed)`. 구체 스타일을 hook이 정하므로 register(`style.register`)도 그 스타일 것으로
전송 — 카테고리 선택은 더 이상 "자동 register 추론"이 아니라 구체 register를 갖는다. 재생성은
저장된 `categoryId`를 그대로 replay하되 seed가 advance → 카테고리 내부에서 다시 굴러간다.

## Consequences

- (+) 선택 단위가 사용자 관점(카테고리)으로 단순화 — 세부 스타일 인지 부하 제거.
- (+) 같은 카테고리에서 생성마다 내부 스타일이 바뀌어 변주 폭이 카테고리×스타일×variation으로 확장.
- (+) seed 기반이라 결정적·테스트 가능(`pick` 패턴 재사용), regenerate에서도 자연스러운 re-roll.
- (+) 레거시 구체 스타일 id가 그대로 해석돼 저장 세션 무손상.
- (−) DR-079가 보장한 "정확히 이 스타일을 고른다"는 직접 제어 상실 — operator가 카테고리 추상화를
  택한 의도적 트레이드오프. 카탈로그는 남아 있어 필요 시 직접-선택 모드 복원 가능.
- (−) 카테고리당 스타일이 2개라 2-style 그룹은 인접 seed가 두 스타일을 번갈아 — 사실상 토글. 그룹에
  스타일을 추가하면 다양성이 자동 확대(카탈로그가 단일 소스).

## Verification

- `design-styles.test.ts`(+5): 카테고리→in-group 스타일, 미래지향=글래스모피즘/오로라만,
  seed 결정성 + 인접 seed re-roll, 미지 그룹→undefined, `resolveStyleSelection`(카테고리/레거시
  스타일/null/미지). aku feature **99 tests** + `tsc --noEmit` + `biome` green.
- 최종 렌더 스타일 충실도는 모델 의존(DR-079와 동일) → DR-077 D6 다양성 하니스로 측정.
