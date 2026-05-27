# DR-design-016 — HoverAffordanceLayer (3-tier hover overlay)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-016 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` → `HoverAffordanceLayer` (new primitive) + 4 tokens |
| Work item | WI-040 Phase 2 |
| Triage Decision | **Step 3 — Grew** (new primitive) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — `SelectionLayer` 는 선택된 한 frame 의 chrome (outline + handles) 만 표현. selection 단일 상태. hover/sibling/parent 3 종 동시 outline 의 책임 분리 불가. |
| 2. Extend | ❌ — `SelectionLayer` 에 hover 슬롯 추가 시 SRP 위반. selection = "선택된 것", hover = "마우스가 가리키는 컨테인먼트". 두 책임 한 컴포넌트 합치면 chrome 종류 enumeration + visibility 매트릭스가 폭발. |
| 3. Grew | ✅ — 새 primitive `HoverAffordanceLayer`. 3 종 outline render 단일 책임. |
| 4. Escape (앱-로컬) | ❌ — hover affordance 는 향후 weave 의 다른 페이지 (PresentPage 의 편집 모드, 별도 board 뷰) + agocraft consumer 서비스에서도 재사용 가능. design-system 격상 정당. |

## Context

WI-040 Phase 1 (commit `a9458de`, 2026-05-27) 가 mode gate 단일-소스를 박제했으므로 새 affordance 의 가드 hook (`useEditAffordancesAllowed`) 은 이미 준비됨. Phase 2 는 *시각 primitive* 만 build — wiring (parent/sibling traversal + DesignPage mount) 는 Phase 3.

사용자 요청 (2026-05-27): "아이템 위로 호버하면 자신의 부모아이템 또는 프레임까지와 형제 아이템들까지 이펙트를 보여주고 싶어 — 프레임과 형제들을 다르게 표현하고 실제로 호버가 일어난 아이템도 별도로 표현, **연결관계를 한눈에 볼 수 있는 이펙트**."

핵심 제약: 3 tier 가 **같은 hue base 안에서 채도/스타일만 분리** — 다른 색조 쓰면 "무관한 정보" 로 인식. 사용자 확정 (이 세션 초반 AskUserQuestion §"3-tier visual 톤").

## Decision

### 컴포넌트 API

```tsx
<HoverAffordanceLayer
  visible={hovered !== null}
  hovered={hoverRect}
  siblings={siblingRects}
  parent={parentRect}
/>
```

```ts
export interface Rect {
  readonly x: number; // design-plane absolute px
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number; // radians, optional
}

export interface HoverAffordanceLayerProps {
  readonly visible: boolean;
  readonly hovered: Rect | null;
  readonly siblings: ReadonlyArray<Rect>;
  readonly parent: Rect | null;
}
```

- `pointer-events: none` 강제 (component-level CSS).
- `aria-hidden="true"` (visual-only, screen reader noise 차단).
- `position: absolute; inset: 0;` design-plane subtree 안에서 좌표 그대로.
- Host (DesignPage, Phase 3) 가 좌표 변환 책임. primitive 는 dumb — props 받은 그대로 render.

### 3-tier 시각 토큰

`packages/design-system/src/tokens.css` 에 추가:

```css
/* WI-040 Phase 2 — hover affordance 3 tier.
 * 모두 var(--accent) 단일 hue. 채도 / dash / glow 로 시각 위계 분리. */
--hover-affordance-stroke-hovered: var(--accent);
--hover-affordance-glow-hovered: color-mix(in oklch, var(--accent) 12%, transparent);
--hover-affordance-stroke-sibling: color-mix(in oklch, var(--accent) 55%, transparent);
--hover-affordance-stroke-parent: color-mix(in oklch, var(--accent) 35%, transparent);
--hover-affordance-tint-parent: color-mix(in oklch, var(--accent) 4%, transparent);
```

각 tier 의 CSS 적용:

| Tier | 적용 |
|---|---|
| **hovered** | `outline: 2px solid var(--hover-affordance-stroke-hovered); box-shadow: 0 0 0 4px var(--hover-affordance-glow-hovered);` |
| **siblings** | `outline: 1px dashed var(--hover-affordance-stroke-sibling); outline-offset: -1px;` |
| **parent** | `outline: 1px solid var(--hover-affordance-stroke-parent); background: var(--hover-affordance-tint-parent);` |

### reduced-motion 대응

`@media (prefers-reduced-motion: reduce)` → `box-shadow` 제거 + transition 0. fade-in 즉시.

### 시각 위계 의도

- **hovered** 가 가장 강한 시각 신호 (2px solid + glow) → "지금 보고 있는 것".
- **siblings** 는 dashed + 채도 낮춤 → "관계는 있지만 타겟 아님" 즉시 구분.
- **parent** 는 thin solid + 내부 tint → "이 모든 것을 감싸는 컨테이너" containment 강조.

세 tier 가 같은 `--accent` 안에 있어 한 그룹으로 인식. 색조 다르게 가면 "무관한 정보" 가 됨 → 사용자 의도 (관계 한눈에) 깨짐.

## Tree-shake gate

- ESM: design-system 의 다른 export 와 동일.
- `sideEffects: ["**/*.css"]` — CSS 만 side-effectful. 컴포넌트 자체 0.
- No decorators / reflect-metadata.
- Named const export.

## Accessibility

- `aria-hidden="true"` — visual affordance, screen reader 영향 0.
- `pointer-events: none` — 클릭 / 호버 빼앗기 없음.
- 색만으로 위계 전달하지 않음 — stroke style (solid / dashed) + width 도 함께 변화 (색맹 대응).

## Selection chrome 와 겹침 방지 규칙

사용자 명시 (2026-05-27): 선택된 아이템 위에 hover overlay 를 그리지 않는다. SelectionLayer 가 이미 그 frame 의 chrome (outline + handles) 을 그리고 있으므로 두 chrome 이 겹치면 시각 노이즈 + handles 클릭 영역 가림.

**적용 위치 = host (Phase 3 DesignPage wiring)** — primitive 는 dumb 유지 (props 받은 그대로 render). Host 가 `useSelection` 의 selectedIds 와 hovered/siblings/parent id 를 교차해 다음 규칙 적용:

| 상태 | 처리 |
|---|---|
| hovered 가 selected | `hovered = null` 로 전달 (overlay 의 hovered tier 자체 omit) |
| sibling i 가 selected | `siblings` 배열에서 i 제외 |
| parent 가 selected | `parent = null` 로 전달 |

전부 selected 인 경우 layer 전체가 visible=true 라도 시각적 출력 0. visible flag 는 keep (호스트가 조건 체크 한 곳에서) — primitive 가 selection-aware 가 되면 SRP 위반.

Dev demo (`/_dev/hover-affordance-demo`) 에 "selected" toggle 4 개 박제 — 각 tier 별로 selection 시뮬레이션 후 overlay 의 해당 tier 가 사라짐을 시각 확인 가능.

## API stability

- `Rect` interface 가 design-plane 절대 px 라는 점 명시 (host 책임).
- `rotation` optional — 회전된 frame 도 지원 (CSS `transform: rotate(${r}rad)`).
- 향후 tier 추가 (예: `grandparent` 회색 hairline) 시 props 확장 OR 별도 prop. 본 PR 에서는 v1 3-tier 만.

## Out of scope (DR-design-016)

- Hover persistence (sticky / pinned hover).
- Keyboard navigation 으로 hover preview.
- Hover affordance 가 canvas-shape child 까지 — frame kind 만 대상 (Phase 3 acceptance 박제).
- DesignPage wiring — Phase 3.

## Visual evidence

Dev demo route `/_dev/hover-affordance-demo` (DEV 빌드 한정) — 정지 디자인에 hardcoded rect 로 3 tier 표시. 사용자가 시각 톤 검토 후 OK 시 Phase 3 진행.

```
┌──────────────────────────── parent (tint, thin solid) ──┐
│  ┌─── sibling (dashed, low) ┐  ┌─── HOVERED (solid+glow)┐│
│  │                          │  │  ◆ ◆ ◆ ◆ ◆ ◆ ◆ ◆ ◆ ◆  ││
│  │                          │  │                       ││
│  └──────────────────────────┘  └───────────────────────┘│
│  ┌─── sibling (dashed, low) ──────────────────────┐    │
│  │                                                │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## History

- 2026-05-27 — DR 발행 + primitive + 토큰 + dev demo 머지 (Phase 2).
