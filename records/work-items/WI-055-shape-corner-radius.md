# WI-055 — Rectangle 모서리 둥글기 (corner radius)

Status: **Done — committed checkpoint**
Owner: hbpark
Updated: 2026-05-30

## Problem

사각형(`shape` 도메인, `subAttrs.shape === "rectangle"`) 아이템의 모서리 둥글기를
사용자가 편집할 수 있는 표면이 없다. agocraft 코어는 이미
`ShapeSubAttrs`의 rectangle 변종에 per-corner `cornerRadii { tl, tr, br, bl }`
(절대 px) 데이터 모델과 SVG 렌더링(`shapeToSvgGeometry` → `<rect rx>` 또는
`rectPathWithPerCornerRadii`)을 보유하지만, weave 쪽에는:

1. 컨텍스트 툴바(`shape-section.tsx`)에 모서리 컨트롤이 없고 (fill/stroke/opacity/sub-kind만),
2. 에이전트(아쿠)가 호출할 **전용** AGENT_COMMAND_SCHEMA가 없다. 제네릭
   `weave.item.update`로 간접 가능하나, 중첩 `subAttrs`를 통째로 재구성해야 해
   에이전트가 안전하게 다루기 어렵다.

## Goal

- Figma식 corner radius UX: **단일 값(링크) 기본 + 링크 해제 시 4코너 개별** 편집.
- 코어의 per-corner 모델을 그대로 활용 (절대 px, 렌더러가 `min(w,h)/2`로 자동 캡).
- 모든 변경은 History 경유 (weave document mutation rule).
- **전용 AGENT_COMMAND_SCHEMA `weave.shape.setCornerRadius`** 를 아주 상세히 정의.

## Scope

| 레이어 | 변경 | 비고 |
|---|---|---|
| agocraft core | **없음** | 데이터 모델 + 렌더 이미 존재 (per-corner px, 자동 캡) |
| weave command | `weave.shape.setCornerRadius` 신규 (`document/commands.ts`) | uniform `radius` 또는 per-corner `radii` 입력, rectangle-only guard, full-attrs subAttrs 재구성 |
| weave schema | `weave-command-schemas.ts` 항목 + `WEAVE_COMMAND_LABELS` | 상세 inputSchema (oneOf radius/radii) |
| design-system | `CornerRadiusControl` 신규 primitive | DR-design-025 (Grew × 1) |
| weave toolbar | `shape-section.tsx` 에 컨트롤 (rectangle sub-kind 한정) | 멀티셀렉트/Mixed 인지 |
| e2e | corner-radius edit + Cmd+Z spec | SVL gate |

## Non-goals

- 비-rectangle 도형의 둥글기(타원/별 등). speech-bubble은 이미 단일 `cornerRadius`
  필드를 갖지만 별도 surface — 이번 범위 밖.
- 0..1 비율 입력. 코어 rectangle 모델은 절대 px이므로 px로 통일 (image/frame의
  0..1 `borderRadius`와는 의도적으로 다름).

## Workflow trail

- Feasibility: [FR-009](../feasibility-reviews/FR-009-shape-corner-radius.md) — **FEASIBLE**.
- Risk: [RISK-009](../risks/RISK-009-shape-corner-radius.md).
- Design review: [DR-design-025](../design-reviews/DR-design-025-corner-radius-control.md).
- Engineering Plan + 상세 schema: `features/shape-corner-radius/ENGINEERING_PLAN.md`.

## Done

- [x] Records (WI/FR-009/RISK-009/DR-design-025/Plan)
- [x] `weave.shape.setCornerRadius` command + register (`document/commands.ts`)
- [x] AGENT_COMMAND_SCHEMA + label (`weave-command-schemas.ts`)
- [x] `CornerRadiusControl` primitive + `IconLink`/`IconLinkOff` + export
- [x] `shape-section.tsx` wiring (rectangle sub-kind only, Mixed-aware)
- [x] Verification: declarativecheck + puritycheck + typecheck green, biome 0 errors,
      commands.test.ts **47 pass** (7 new), e2e `shape-corner-radius.spec.ts` **3/3 pass**
      (uniform+Cmd+Z/redo, per-corner merge, guards).

## Implementation notes

- **UI path** uses `updateAll` → `weave.item.update`(patch rebuilds the COMPLETE
  `subAttrs`) so multi-select collapses to ONE undo step, matching the rest of
  `shape-section.tsx` (sub-kind change rebuilds subAttrs the same way).
- **Agent path** uses the dedicated `weave.shape.setCornerRadius` (rectangle
  guard + radius/radii exclusivity), which is also the unit/e2e-tested command.
- agocraft change: **0** (core already had per-corner `cornerRadii` + render).
