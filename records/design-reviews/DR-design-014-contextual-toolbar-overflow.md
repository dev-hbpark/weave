# DR-design-014 — ContextualToolbar priority + dynamic More overflow

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-014 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` → `ContextualToolbar` |
| Triage Decision | **Step 2 — Extend** (기존 primitive 의 minimum API 확장) |
| Supersedes (partial) | DR-design-009 §"single horizontal flex bar" — bar 가 이제 width-aware. |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — 기존 primitive 는 단순 flex bar. text-section 16개 가 가로로 펼쳐져 1280px viewport 에서도 overflow → 사용자가 "가로 최대 길이 제한 + 더보기" 요구. |
| 2. Extend | ✅ — `Bar.Section` 에 `priority?: number` prop 1개 + `Bar` root 가 ResizeObserver 로 fold 결정. visual API 미변경, 기존 host 미수정 시 default priority=50 으로 fold 안 일어남. |
| 3. Grow | ❌ — 새 primitive 도입 불필요. |

## Context

text-section 만 16 section, 1280px viewport 에서도 가로 overflow. shape/image/video 도 좁은 viewport 에서 같은 문제. 사용자 요청: "가로 최대 길이 제한 + 자주 안 쓰는 메뉴 더보기 + 반응형".

선택지(사용자 확정):
- folding 전략: **ResizeObserver 동적** (정적 breakpoint X — 사이드패널 등으로 가용 width 가 viewport 미만일 때도 적응)
- Text Primary 5: **Family · Font · Size · Align · Color**. 나머지 11 (Mode · V-Align · Decoration · Case · Background · Line height · Letter spacing · Truncate · Max lines · Hyperlink · Opacity) → More.

## Decision

### `Bar.Section` API 확장

```ts
interface ToolbarSectionProps extends HTMLAttributes<HTMLDivElement> {
  readonly label?: string;
  /** DR-design-014. fold 우선순위. 숫자가 **클수록** "필수" — 마지막에 fold.
   *  Default 50. 범위 권장: 0 (제일 먼저 fold) ~ 100 (절대 fold X). */
  readonly priority?: number;
  children?: ReactNode;
}
```

### Bar root 가 추가하는 내부 동작

1. **Measurement**: 첫 mount + 각 section 의 visible-in-flow render 시 `getBoundingClientRect().width` 캐시.
2. **Fit decision**: container width 와 누적 section width 비교. 합이 over 면 priority 최저인 section 부터 fold set 에 추가. unfold 도 동일 알고리즘 역방향.
3. **Rendering**: fold 된 section 은 `createPortal` 로 More popover 의 container 에 이전. **같은 React component instance** — state(예: ColorPicker open, NumberSlider drag) 보존.
4. **More 버튼**: fold set 이 비어있지 않을 때 bar 우측 끝에 mount. `Popover` 로 fold 된 sections vertical stack 표시.
5. **ResizeObserver**: container 크기 변화에 자동 recompute.

### Reservation

- More 버튼 자체의 폭 (~80px) 을 measurement 에 미리 예약 — fold 가 시작될 때 More 가 갑자기 등장하면서 더 좁아지는 cascade 회피.
- safety gap ~12px — 부동 소수점 width measurement 의 jitter 흡수.

## Priority assignments (per kind)

| Kind | Section | priority |
|---|---|---|
| frame | Background | 100 (single section, fold 불필요) |
| image | Source | 100 |
| image | Fit | 80 |
| image | Opacity | 50 |
| image | Border radius | 40 |
| video | Source | 100 |
| video | Fit | 80 |
| video | Loop | 50 |
| video | Muted | 50 |
| video | Volume | 40 |
| shape | Shape | 100 |
| shape | Fill | 90 |
| shape | Stroke | 80 |
| shape | Opacity | 50 |
| text | Family | 100 |
| text | Font (B/I/U) | 95 |
| text | Size | 90 |
| text | Align | 85 |
| text | Color | 80 |
| text | 나머지 11 | 50 이하 |

세부 mapping 은 section 파일 안에서 inline.

## Constraints

- **State preservation**: section 이 visible↔folded 를 오갈 때 child component (ColorPicker 등) state 가 reset 되면 안 됨. `createPortal` 의 component-identity 보존 활용.
- **Hover/keyboard a11y**: More 버튼은 `aria-haspopup="true"` + `aria-expanded`. Popover 안의 section 은 visible 시점의 `role="group"` 동일 유지.
- **SSR**: ResizeObserver 는 client-only. SSR 시 모든 section visible 가 default — 첫 hydration 에서 측정 후 fold.
- **Reduced motion**: fold 전환 시 layout shift 가 일어나도 모션 효과 없음 (이미 instant).

## Risks

| Risk | 완화 |
|---|---|
| createPortal 로 children 의 state 가 reset 되는 React 버전 의존성 | React 18+ 는 portal 의 component identity 보존. weave/agocraft 의존 React 19. |
| 측정 cycle 무한 루프 (fold → bar 짧아짐 → unfold → 다시 length…) | More 버튼 폭을 항상 예약 + safety gap → 양쪽 임계값 사이의 hysteresis 보장. |
| 측정 cache stale (Font family 변경 등으로 section 폭 변경) | Section 내부의 layout-affecting prop 이 변경되면 자연스레 재측정되도록 ResizeObserver 가 section 자체에도 부착되거나, 각 section ref 가 ResizeObserver 같이 사용. |
| Floating bar 의 height 가 1행→2행 으로 늘어나는 점프 | Bar root 의 `max-w-[min(92vw,1100px)]` cap + `flex-nowrap` 강제. 폴딩 알고리즘이 overflow 전에 작동하므로 2행 진입 불가. |

## Verification

1. `apps/web/e2e/toolbar-overflow.spec.ts` — 좁은 viewport (e.g. 900px) 에서 text 선택 → More 버튼 존재, Primary 5 visible, More 클릭 시 popover 내부에 hidden section 들 발견 가능.
2. 기존 text-item / multi-toolbar / item-primitives spec 회귀 없음.
3. State preservation: ColorPicker 를 popover 안에서 열어 색 선택, viewport 늘려서 bar 로 unfold 됐을 때 동일 색 유지.

## Cross-references

- `feedback_design_system_triage_mandatory` — 본 작업은 UI 변경이라 Triage 의무. Step 2 Extend.
- `feedback_radix_bubble_outside_dismiss_pitfall` / DR-design-013 — More popover 도 Radix Popover 위에 얹혀있으므로 capture-phase 백스톱 자동 적용.
- DR-design-009 — original ContextualToolbar 정의.
