# WI-091 — orphaned PropertiesPanel + interaction-rows 디컴미션

Status: **Done** (2026-06-04 — 삭제·검증 완료)
Owner: hbpark
Updated: 2026-06-04

## Problem

WI-090(링크 유닛) 작업 중 발견: `pages/PropertiesPanel.tsx` + `pages/interaction-rows/`
전체가 **어디에도 마운트되지 않은 죽은 코드**(import 0건, e2e/테스트 의존 0건). 에디터 UX는
`ContextualToolbar` + per-kind `sections/`(DR-027) + cross-kind 섹션(WI-090)으로 이전됐으나
이 패널은 제거되지 않고 남아 있었다 → Decommission Sweep 대상.

## Decision (DR-053)

`PropertiesPanel.tsx` + `interaction-rows/`(8파일) **삭제**. 라이브 역량 손실 없음(해당 저작
UI는 마운트된 적 없음; behavior는 aku 에이전트 + 런타임 레지스트리로 동작). 남은 behavior
kind(hotspot/hover/animation/camera/reveal)의 **수동 저작**은 수요 발생 시 `LinkSection`처럼
ContextualToolbar 섹션으로 추가(패널 부활 아님).

## 삭제 대상

- `apps/web/src/pages/PropertiesPanel.tsx`
- `apps/web/src/pages/interaction-rows/` — `index.ts`, `types.ts`, `button-trigger.tsx`,
  `camera-target.tsx`, `entrance-animation.tsx`, `hotspot.tsx`, `hover-effect.tsx`,
  `reveal-on-step.ts`

## Gate / 검증

- `pnpm typecheck` green(댕글링 참조 0 — tsc로 확인) · `pnpm biome check` 무결 ·
  `pnpm test` green(회귀 없음) · e2e 회귀 없음(참조는 주석뿐).

## Cross-refs

- DR-053, WI-090/DR-052, DR-027(ContextualToolbar)
