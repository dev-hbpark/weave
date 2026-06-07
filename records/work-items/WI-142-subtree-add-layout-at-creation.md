# WI-142 — weave.subtree.add: 생성 시점 레이아웃(layout-at-creation)

- **Status:** RETIRED (DR-099) · **DR:** DR-097(superseded) · **Relates:** WI-141/DR-096(subtree.add v1), small-think DR-048(롤백 근거)
> 은퇴(2026-06-08, DR-099): 회귀는 고쳤으나 parity, subtree.add 전체가 에이전트에서 제거됨.

## Problem

`weave.subtree.add` v1(WI-141)의 NodeSpec에 `layout`이 없어, auto-layout 프레임이 **레이아웃
없이** 생성됨 → 자식이 배치를 못 받고 **seed(기본) 크기**로 떨어짐(작은 폰트, 모양 안 맞음) →
모델이 사후 `frame_setLayout`(98)·`item_update`(105) storm으로 교정. small-think 라이브 측정
(DR-048): 수정/생성 1.45→4.08, 총 턴 +69% → subtree-first 가이드 롤백됨.

## Change

NodeSpec에 **`layout?: LayoutSpec`** 추가. addNode가 이를 `attrsOverride.layout`(normalized)로
접어 프레임을 **레이아웃과 함께 생성** → 이어서 working-doc 리플레이로 추가되는 자식이
addItem의 `onChildAdd`에서 실제 부모 레이아웃을 읽어 **생성 시점에 정위치**(seed-크기/ setLayout
storm 제거). 스키마 node에 `layout: LAYOUT_SPEC` + "auto-arrange할 프레임엔 항상 layout 지정,
아니면 자식이 작은 기본 크기로 떨어진다" 안내.

## Acceptance

- node.layout 지정 시 생성된 프레임 attrs에 정규화된 auto-flex/grid layout 포함. ✔
- 그 프레임의 자식이 생성 시점에 레이아웃으로 배치(seed-크기 회귀 해소). ✔
- absolute(레이아웃 없음) 프레임은 기존대로 자식 frame 필요. ✔
- commands typecheck + test(신규 layout 테스트), coverage, biome, Rule 6 그린. ✔

## Links

- DR-097 · `apps/web/src/document/commands.ts` · `apps/web/src/features/aku/agent/weave-command-schemas.ts`
- 효과 검증: small-think DR-046 텔레메트리로 재측정 후 net-win 시 subtree-first 가이드 재안내(DR-048 Stage 2).
