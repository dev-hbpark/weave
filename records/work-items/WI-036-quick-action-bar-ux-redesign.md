# WI-036 — QuickActionBar UX 재설계 (frame edge anchor + hover grace)

## Metadata

| Field | Value |
|---|---|
| ID | WI-036 |
| Title | QuickActionBar 가 hover leave 시 사라져서 click 불가 — frame top-edge anchor 로 mount 위치 변경 + hover target 의 union (frame ∪ bar) 인식 + grace period. |
| Owner | hbpark |
| Status | **Done** (2026-05-26 — primitive 확장 + anchored mount + hover target union + 200ms grace + 3 e2e PASS + 25 figma group 회귀 0) |
| Severity | P2 (user-affordance, blocker 아님 — WI-035 P1 / P3 / Alt+drag 가 회피 경로 제공) |
| Created | 2026-05-26 |
| Target | v1 (T-0 2026-06-08 직전 또는 후) |

## Summary

WI-035 P2 의 QuickActionBar "+" button 이 frame 위 hover 시 등장하지만, 사용자가 마우스를 bar 로 이동하는 도중 frame 영역을 벗어나면 hover state 가 빠지고 bar 의 commands 가 즉시 사라져 click 불가. WI-035 follow-up 의 사용자 보고 (2026-05-26).

## Root cause

QuickActionBar 는 design-system 의 generic primitive — visibility 는 host 의 HoverContext (data-frame-id 의 hovered 추적) 에 의존. 현재 DesignPage 의 mount 위치는 fixed `top-16 right-4` — frame 과 bar 사이 마우스 이동 경로에 frame-외부 영역이 길게 있어 hover state 가 leave → 빈 commandIds → bar 의 commands 가 emptyFallback (null) 으로 사라짐.

## Scope

### In scope

1. **A — Frame edge anchor**: bar 의 mount 위치를 NestedFrame 의 top-left edge 의 absolute child 로 이동. 즉 bar 가 frame 의 자식 element 가 되어 마우스가 bar 위에 있어도 `data-frame-id` 의 ancestor 로 frame 인식 (HoverContext 유지).
2. **B — Hover target union**: useHoverContext 가 `[data-quick-actions-bar]` 또는 그 후손을 frame hover 의 연속으로 인식 — bar 가 frame 의 visual 외부에 mount 돼도 hover state 유지.
3. **C — Grace period**: hover leave 시 즉시 EMPTY 로 update 하지 말고 short setTimeout (200ms) 지연. 그 사이 다음 hover (frame 또는 bar) 가 들어오면 timer cancel. unmount/cleanup 시 timer clear.
4. **e2e**: `figma-quickaction-add.spec.ts` 의 hover trajectory 확장 — frame 위 hover → frame 밖 → bar 위 도착 → click 의 connected gesture 시뮬레이션.

### Out of scope (v1.x)

- C (option C): 호버 의존 없이 frame 우상단 corner 의 항상-보이는 + handle. discovery + click ease best 지만 chrome 시각 노이즈 ↑. WI-036 다음 별 WI 후속.
- Frame 의 selected state 에서 bar 의 sticky pinned 모드 (mouse 가 frame leave 해도 selected → bar 유지).
- AITooltip 의 같은 hover gap 문제 (별 surface — WI-036 의 fix 가 검증되면 같은 패턴 흡수).

## Acceptance

### Build

- [ ] QuickActionBar mount 위치를 NestedFrame 의 child 로 이동 (FrameStage 의 frame body 안 absolute top-left edge anchor).
- [ ] `data-quick-actions-bar` attribute — bar 의 wrapping div 에 박제. useHoverContext 가 이 attribute 의 ancestor 도 frame hover 의 연속으로 인식.
- [ ] useHoverContext 에 200ms grace period — leave 시 timer set, 다음 enter 시 cancel.
- [ ] DesignPage 의 fixed `top-16 right-4` mount 제거 (per-frame mount 로 대체).
- [ ] `pnpm verify:no-e2e` PASS — typecheck + declarativecheck + puritycheck + unit + build.

### e2e

- [ ] `figma-quickaction-add.spec.ts` 의 기존 1 spec PASS 유지 (hover + click).
- [ ] 신규 spec: hover frame → mouse 가 frame 밖 (bar 와 frame 사이 gap) 으로 이동 → bar 위 도착 → click. PASS.
- [ ] 신규 spec: hover frame → 200ms 이상 leave → bar 사라짐 (grace expire). PASS.
- [ ] WI-033 / WI-034 / WI-035 의 24 e2e 회귀 0.

### LG-002 update

- [ ] WI-035 follow-up Defer 항목 close. CONDITIONAL READY 의 P2 UX 조건 cleared.

## Risks

- bar 의 frame edge anchor 가 frame 의 right side / bottom side / center 에서 보일 때 — visual overlap 가능. v1: top-left 만, edge 의 자동 flip 은 v1.x.
- 같은 frame 안 여러 selected items 시 어느 frame 의 bar 가 보일지 — hovered frame 만 (single source of hover).
- grace period 200ms 가 너무 짧으면 사용자 mouse-slow 시 fail. 너무 길면 다른 frame 으로 빠르게 이동 시 stale bar 표시. 200ms 는 Figma 의 hover-card 기본 값과 align.

## Links

- Triggering: WI-035 follow-up (P2 UX 재설계 deferred 의 fix).
- 의존: 없음 — QuickActionBar primitive 의 host wrap 확장 (DR-design-012 후속).
- 영향: LG-002 의 P2 UX conditional close.
- 다음 단계: FR-007 (FEASIBLE) → RISK-006 (GO WITH CONDITIONS, 1 condition) → DR-design-012 (primitive 확장 review) → Engineering Plan → Build → e2e → LG-002 update.
