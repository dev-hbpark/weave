# DR-106 — Rule 6 잔재 정리: intentFromOperation + per-kind attrs normalizer를 레지스트리로

- 상태: ACCEPTED — 구현 완료
- 관련: weave↔agocraft 책임분배 전수 코드리뷰(2026-06-09); 같은 파일의 선례 `REOPERATE_TARGET`(classifier.ts) / `ATTRS_NORMALIZERS`(commands.ts); OS-root CODE_STRUCTURE_DESIGN_RULES Rule 6
- 영역: `apps/web/src/features/aku/agent/intent/classifier.ts`, `apps/web/src/document/commands.ts`

## 맥락

weave엔 이미 `tools/check_declarative_dispatch.sh`(Rule 6 게이트)가 포팅돼 `verify`에 배선돼 있고 green이다. 그러나 게이트는 의도적으로 `kind|type|mode|category|variant|shape`로 끝나는 디스크리미넌트만 탐지한다(`operation`·`op` 등은 false-positive 회피로 제외 — 게이트는 backstop이지 compliance 증명이 아님). 전수 리뷰가 게이트가 못 잡는 Rule 6 잔재 2건을 찾았다:

1. **`intentFromOperation`** — `if (operation === "create" || operation === "add")` / `if (operation === "recolor")` / fallthrough 체인. 바로 15줄 아래 형제 `withOperation`은 이미 `REOPERATE_TARGET: Record<Operation, …>` 레지스트리(주석 "레코드 기반 — switch 금지(Rule 6)")라 **명백한 불일치 잔재**.
2. **commands.ts per-kind attrs normalizer** — `weave.item.add`는 `if (kind==="shape"){…} if (kind==="text"){…}` 두 독립 가드(게이트의 "separate if chains, not machine-detectable" 케이스), `weave.items.update`는 `kind==="shape" ? … : kind==="text" ? … : raw` ternary 체인. 같은 안전 패스가 두 사이트에 분기-중복. 같은 파일에 이미 병합-인지형 `ATTRS_NORMALIZERS` 레지스트리가 있다.

## 결정

둘 다 **파일에 이미 존재하는 레지스트리 idiom 그대로** 접어 넣는다(행동 무변경):

1. `INTENT_FROM_OPERATION: Record<Operation, IntentBuilder>` 도입 — 3개 동작군 빌더(`planNoTarget`/`planRecolor`/`planSelectionTarget`)를 7개 operation에 매핑. `intentFromOperation`은 `INTENT_FROM_OPERATION[operation](…)` 한 줄로. `Record<Operation, …>`라 컴파일러가 exhaustive 강제. (부수: `detectTonePolicy(text, operation==="add" ? "inherit" : "inherit")`의 동일-양변 삼항을 `"inherit"`로 단순화 — 동작 동일.)
2. `RAW_ATTRS_NORMALIZERS: Partial<Record<DomainKind, (attrs)=>attrs>>`(shape→normalizeShapeAttrs, text→sanitizeFontSizeSpec) + `normalizeAttrsForKind(kind, attrs)` 헬퍼 도입. add 경로는 `RAW_ATTRS_NORMALIZERS[kind]` lookup 후 적용, items.update 경로는 `normalizeAttrsForKind(child.kind, mergedRaw)` 한 줄로. 새 kind 정규화는 두 사이트 수정이 아니라 어댑터 1개 등록.

## 트레이드오프

- 행동 무변경(순수 구조 리팩터). add 경로는 "정규화기 존재 시에만 재래핑" 의미 보존(불필요한 객체 재생성 없음).
- `intentFromOperation`의 tone은 레지스트리 밖에서 1회 계산 후 빌더에 주입 — 빌더는 순수.
- 게이트 자체는 `operation` 미탐지 그대로 둔다(widening은 false-positive 비용 큼). 이 잔재는 리뷰/이 DR로 처리.

## 대안 (기각)

- **게이트를 `operation`까지 widening** — `fit`/`role`/`status` 등과 함께 false-positive 폭증(게이트 헤더가 명시). 리뷰-레벨 처리가 맞다.
- **둘 중 하나만 수정** — `intentFromOperation`만 고치면 commands.ts ternary/2-if 잔재가 남아 같은 클래스가 재누적.

## 검증

- typecheck 0, biome 0(touched 2파일), declarativecheck exit 0(유지).
- 영향 테스트 green: `classifier.test.ts` + `commands.test.ts` = 145 통과.
- 분기 잔재 grep 확인: 편집 사이트에 `operation === "recolor"` / `kind === "shape"` 등 잔존 0.
