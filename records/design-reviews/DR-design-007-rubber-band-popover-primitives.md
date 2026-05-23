# Design Review — DR-design-007

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-007 |
| Title | Rubber-Band + Popover primitives — drag-on-empty-area 의 component creator 의 design-system foundation |
| Triggering Work Item | WI-017 |
| Triage outcome | **Grew (new primitives)** — Step 3 of design-system-triage decision tree. 2 primitives 의 동시 박제. |
| Status | Agent-Reviewed (pending human) — `design-system-agent` ✅ + `library-adoption-supply-chain-governance-agent` ✅ + `frontend-design-pattern-agent` ⚠️ (Accept with notes, 2026-05-23) |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (자동), `frontend-design-pattern-agent` (a11y / pointer capture / floating UI), `library-adoption-supply-chain-governance-agent` (`@radix-ui/react-popover` 신규 의존), hbpark |
| Date | 2026-05-23 |
| Target SLA | 2026-05-25 (Phase B 진입 전) |

## 1. Change in one sentence

`@weave/design-system` 에 **`RubberBand`** (드래그 drawer + dimensions tooltip + grid snap visual) 과 **`Popover`** (Radix `react-popover` 의 thin wrapper, aurora-glass surface) 의 2 primitives 박제. WI-017 의 drag-to-create 인터랙션 의 visual foundation.

## 2. Why

- **User problem this solves**: WI-017 의 5-stage 인터랙션 의 의무 시각 박제 — 드래그 궤적 시각화, 비율 의 실시간 dimensions, 가이드 박스 의 점선 / pulse 의 상태 별 visual, recommendation 의 floating popover, skeleton preview 의 화면 위치.
- **Why an existing primitive does not cover it**:
  - **`SelectionLayer`** — 이미 선택된 element 의 manipulation handles 박제. drawing 의 자체 (mouse 의 시작점 → 현재점 의 rectangle) 는 없음 + dimensions tooltip 의 없음 + 점선 가이드 state 의 없음.
  - **`AITooltip`** — hover 의 hint, drawing 시 의 영구 visible 의 의도 와 다름.
  - **`DropdownMenu` / `ContextMenu`** — trigger 의 anchor 가 항상 같은 element. WI-017 의 popover 의 anchor 는 동적 (drag rect). Radix 의 `react-popover` 가 자체 collision-aware floating 의 박제.
- **Why now**: WI-017 의 Phase B 의 의무. design-system foundation 의 박제 전 의 application code 의 inline lookalike 박제 시 회귀 의 risk + Hard rule 1 ("Every UI component lives in `packages/design-system/`") 위반.

## 3. Visual evidence

Pre-visual — 사용 의도 의 sketch:

```
빈 공간 드래그 시 (RubberBand):
┌─────────────────────────────────────┐
│                                     │
│      drag start                     │
│         ┌───────────────────┐ ◄── 1px solid accent border
│         │                   │       (drawing) / 1px dashed
│         │                   │       (reviewing) / 2px solid
│         │       Skeleton    │       accent + glow (previewing)
│         │       preview     │
│         │       (fade-in)   │
│         │  (only on item    │ 480 × 270 ◄── dimensions chip
│         │   hover)          │       (motion-quick fade)
│         └───────────────────┘
│                                     │
│                ┌────────────────────┐
│                │ ⚡ Wide ratio       │ ◄── Popover (collision-aware)
│                │ — 와이드 배너        │
│                │ — 가로 통계 차트     │
│                │ — 그리드 테이블      │
│                └────────────────────┘
└─────────────────────────────────────┘
```

Visual state transitions of RubberBand:
- `drawing` — 1 px solid `--accent` border + soft `--accent-soft` fill, dimensions chip top-right.
- `reviewing` — 1 px dashed `--text-soft` border + 무색 fill, no chip (popover 가 별 surface).
- `previewing` — 2 px solid `--accent` border + `--shadow-glow` + pulse animation, skeleton 자체 내부 fade-in.

## 4. Scope of the change

- [ ] New token — **없음** (기존 토큰 만 사용)
- [ ] Modified existing token — **없음**
- [x] New component primitive — **`RubberBand`** (`packages/design-system/src/components/RubberBand.tsx`), **`Popover` + `PopoverTrigger` + `PopoverContent` + `PopoverArrow`** (`packages/design-system/src/components/Popover.tsx`)
- [ ] New variant on an existing component — **없음**
- [ ] New theme variant — **없음**
- [ ] Public-facing surface affected — **현재 단계 없음** (editor 만). 향후 marketing landing 의 "live demo" 의 사용 가능성 있음 — public 진출 시 별 PR 의 visual 점검.

### 4-1. `RubberBand` API

```tsx
import { RubberBand, type RubberBandRect, type RubberBandState } from "@weave/design-system";

<RubberBand
  rect={{ left: 120, top: 80, width: 480, height: 270 }}
  state="drawing"   // "drawing" | "reviewing" | "previewing"
  showDimensions={true}   // dims chip; default true on drawing only
  // pulse + skeleton 은 부모 가 children 으로 inject (skeleton 컨텐츠 의 도메인 polymorphism 박제 — design-system 의 책임 아님).
>
  {state === "previewing" ? <DomainSkeleton kind={previewKind} /> : null}
</RubberBand>
```

내부 박제:
- 위치 / 크기 는 `style={{ left, top, width, height }}` (motion lib 의 `layout` prop 으로 state 전환 시 morphing 의 박제).
- visual state — `data-state` attribute + Tailwind variant selectors (예: `data-[state=previewing]:animate-pulse`).
- dimensions chip — `RubberBand.DimensionsChip` 의 자체 sub-component, `top-right` 의 fixed corner + `var(--surface-2)` glass + 11px font-mono.
- pointer-events: none (의무). 부모 가 hit-test 의 책임.

### 4-2. `Popover` API

```tsx
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
} from "@weave/design-system";

<Popover open={isReviewing} onOpenChange={...}>
  <PopoverTrigger asChild>
    <RubberBand rect={...} state="reviewing">{children}</RubberBand>
  </PopoverTrigger>
  <PopoverContent side="auto" sideOffset={8} collisionPadding={16}>
    {/* recommendation list */}
    <PopoverArrow />
  </PopoverContent>
</Popover>
```

Radix `react-popover` 의 thin wrapper. PopoverContent 의 aurora-glass surface (DR-design-005 의 Dialog 의 visual 패턴 의 mirror). `asChild` 의 wrapper 박제 의 의무 — [[feedback-radix-slot-wrapper-forwardref]] 의 박제 의 적용 의무 (Phase B 의 의무 박제).

### 4-3. Tokens used

| Slot | Token | Purpose |
|---|---|---|
| Border (drawing) | `--accent` 1 px | active drawer outline |
| Fill (drawing) | `--accent-soft` | soft drag area highlight |
| Border (reviewing) | `--text-soft` 1 px dashed | persistent guide |
| Border (previewing) | `--accent` 2 px | active selection feedback |
| Shadow (previewing) | `--shadow-glow` | pulse 의 glow base |
| Dimensions chip bg | `--surface-2` + `--surface-blur` | floating glass chip |
| Dimensions chip text | `--text-strong` + `11px font-mono` | tight number display |
| Dimensions chip border | `--border-strong` | crisp ridge |
| Popover surface | `--surface-1` + `backdrop-blur(--surface-blur)` | aurora glass |
| Popover border | `--surface-1-border` | 1 px subtle |
| Popover shadow | `--shadow-glass` | elevated floating |
| Popover radius | `--radius-md` | corner |
| Snap helper line | `--accent` 1 px dotted, 0.5 opacity | grid alignment indicator |
| Motion (RubberBand state transitions) | `var(--motion-quick)` + `var(--motion-spring-soft)` | drawing→reviewing→previewing |
| Motion (Popover entrance) | `var(--motion-quick)` + `var(--motion-spring-soft)` | fade + small slide |
| Pulse animation | `var(--motion-slow)` (520ms) keyframes | 숨 쉬는 듯한 active feedback |

**New tokens 추가 0**. 기존 semantic + motion 토큰 만 사용. Pulse keyframes 는 component-local CSS (외부 source 없음 — Tailwind `@keyframes` 의 자체 박제).

## 5. Consistency check

- [x] All new color/text combinations meet WCAG AA contrast — 기존 토큰 의 조합. dimensions chip 의 (surface-2 + text-strong) 의 contrast 는 이미 DR-design-005 의 IconButton tooltip 의 박제.
- [x] Motion respects `prefers-reduced-motion: reduce` — RubberBand 의 state 전환 + Popover entrance + Pulse 모두 motion lib `useReducedMotion()` 의 short-circuit 박제 의무.
- [x] Focus-visible ring uses `--focus-ring` — Popover 의 contents 의 focusable elements (recommendation items) 의 의무.
- [x] Keyboard navigation works — Esc → popover close + rubber-band cancel; recommendation items 의 ↑↓ + Enter (Radix 의 자체 박제).
- [x] Component reads tokens, not hard-coded values — `cn() + var()` 패턴, hex / rgb 0.
- [x] Variant ceiling — RubberBand 의 `state` 의 3 (drawing / reviewing / previewing) ≤ 5. Popover 의 variant 0.
- [x] Theme — Aurora / Mono / Vivid 의 회귀 의 의무 (Phase G 의 e2e 박제).
- [x] If this is a token — N/A.

## 6. Brand alignment

(public-facing 은 deferred 이므로 약식)

Aurora glass 의 톤 의 mirror — RubberBand 의 dimensions chip + Popover surface 의 `--surface-2 / --surface-1 + backdrop-blur` 의 reuse. Pulse 의 keyframes 는 Aurora 의 slow drift (`--motion-aurora-drift`) 와 비슷한 cadence (한 사이클 2~3 초) 의 박제 — 디자인 톤 의 일관.

Mono theme — backdrop-blur 의 fallback (lower alpha surface) 도 dimensions chip 의 contrast 통과 의무. Vivid theme — Pulse 의 `--accent` 의 강한 glow 의 stagger 의 의무.

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | ✅ | **Accept (design-time review).** 17 tokens 모두 resolve — 13 개 가 Aurora / Mono / Vivid 3 블록 모두 정의, 4 개 (`--radius-md`, `--motion-quick`/`-slow`/`-spring-soft`, `--motion-aurora-drift`) 가 base scale (theme-독립, `:root` 의 자체). 신규 토큰 0, 신규 theme variant 0, 신규 variant 0 — Hard rule 4·5·6 통과. RubberBand 의 3 states (drawing / reviewing / previewing) ≤ 5 ceiling. 도메인-free 의 의무 박제 — skeleton 의 도메인 silhouette 는 호출 측 의 children injection 박제 (§9 trade-off). reduced-motion 의 의무 박제 §4-3 + §5 — 모든 motion path 의 short-circuit. Hard rule 1 (`packages/design-system/` 거주) + Hard rule 2 (hex / rgb / magic-ms 0) 의 verification 은 Phase B 구현 시 (현재 source 미존재 — DR 의 design-time stage). 🌱 Grew Step 3 의 triage outcome 의 §2 evidence (`SelectionLayer` / `AITooltip` / `DropdownMenu` 의 어떤 조합도 5-stage flow 불가) 가 convincing. Open question §10 의 3 항 (snap-line 위치, popover single-instance, arrow visual) 은 Phase B 의 구현 시 자체 의 결정 — blocker 아님. |
| `frontend-design-pattern-agent` | ⚠️ | **Accept with notes.** Pattern fit 분석: State (4-state machine — idle/drawing/reviewing/inserting) + Strategy (`InsertableCapability` per containerKind, DR-012) + Adapter (Radix wrapping) + Command (`editor.exec`) + Composite (skeleton via children injection) — 모두 *adapt-of-need* 박제 의 자연 application 의 over-engineering risk 0. **그러나 platform primitive 의 의 의무 검토 (charter rule)**: OS-root `MODERN_WEB_GUIDANCE.md` 가 popover 류 의 "**Popover API + CSS Anchor Positioning**" 의 자체 의 권장 — Chrome 114+ / Safari 17+ / Firefox 125+ 의 baseline 지원. 이 WI 의 specific use case (dynamic anchor = drag rect, internal recommendation list 의 state, fade preview + pulse 등 의 합성) 의 측면 에서 platform API 의 박제 시: (a) `anchor-name` 의 dynamic 변경 의 자체 박제 의무 (CSS variable + ResizeObserver), (b) light-dismiss 의 의무 의 manual 박제 (Esc + outside-click 의 자체 — Popover API 의 자체 의 의무), (c) React state 의 bind 의 자체 의 박제 (open prop 의 자체 의무 — Popover API 의 imperative API), (d) collision detection 의 자체 박제 의 의 의무 (CSS Anchor Positioning 의 fallback 의 자체) — 의무 의 의 ~150 LOC 의 자체 + new edge case test. Radix `react-popover` 의 ~6 KB gzip + 0 LOC + battle-tested — 의 의 의 trade 의 의 명백 의 Radix 의 우위. **그러나 의무 박제**: DR-design-007 §9 (trade-offs) 의 의 "platform Popover API + Anchor Positioning 의 의 검토 결과 + 채택 안 한 의 의 근거" 의 의 명시 추가 의 의무 — agent 의 charter rule 의 박제 의 의무. **Phase B 의 의무 의 추가 박제**: ① RubberBand 의 `pointer-events: none` 의 의 의 의 의 의 host element (DesignPage / NestedFrame) 의 의 `setPointerCapture` 의 의 명시 박제 (의 의 의 빠른 drag 시 의 pointer 의 host 외 이탈 의 의 회피). ② dimensions chip + persistent guide + skeleton 의 의 `aria-hidden` (pointer-only 의 의 의 의 SR 의 의 의무 의 의 의 의무 0). ③ popover close 시 의 focus restoration target 의 명시 — Radix 의 default 는 trigger 의 (synthetic RubberBand 의 의 의 부적합) — `document.body` 또는 canvas 의 의 의 의 선택 의 의무. ④ 사용자 의 의 의 reduced-motion 의 의 skeleton fade-in + pulse 의 의 의 의 의 short-circuit 의 의 명시 (§5 의 의 의 박제 의 의 의무 의 의 일관). |
| `frontend-architecture-agent` | (pending) | RubberBand 의 React-controlled state vs DOM event-driven 의 boundary 박제. children injection (skeleton) 의 polymorphism 위치 박제. |
| `seo-ai-visibility-agent` | N/A | public surface 미적용. |
| `library-adoption-supply-chain-governance-agent` | ✅ | **Adopt.** `@radix-ui/react-popover` 의 신규 의존 — Radix Primitives family 의 7번째 (기존 6: `react-context-menu` ^2.2 / `react-dialog` ^1.1 / `react-dropdown-menu` ^2.1 / `react-radio-group` ^1.3 / `react-slot` ^1.2 / `react-toggle-group` ^1.1). 동일 vendor + 동일 maintainership + 동일 release cadence + 동일 license (MIT) + 동일 caret-pinned version style. Bundle 영향: 자체 의 ~6 KB gzip + transitive `@floating-ui/react-dom` (~12 KB gzip) — 새 editor surface 의 의 의무 의 acceptable. Maintenance: 활발 (weekly releases). Vulnerabilities: Radix Primitives 의 CVE history 의 cleanliness — 의 의무 의 위험 0. APPROVED_LIBRARY_CATALOG 의 expansion 의 의무 — Adopt with thin wrapper (DR-design-007 §4-2 의 의무 의 박제 — Slot wrapping 의 의무 의 [[feedback-radix-slot-wrapper-forwardref]] 의 박제 의무 의 Phase B 의 의무 확인). Owner: hbpark. Review date: 2026-05-23. |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-23 | Proposed. Phase B 진입 전 agent + 본인 sign-off 의무. |

## 9. Trade-offs accepted

- **Children injection for skeleton** — RubberBand 가 도메인 별 skeleton 의 visual 박제 안 함. 호출 측 (apps/web) 의 children 의 자체 inject. 의도 — design-system primitive 의 domain-free 의 유지 (design-system-agent 의 charter rule "Keep primitives domain-free").
- **Platform Popover API + CSS Anchor Positioning 의 검토 + Radix 채택 의 근거** (frontend-design-pattern-agent 의 charter 의 의 의무 박제, 2026-05-23):
  - OS-root `docs/04-specialized-engineering/MODERN_WEB_GUIDANCE.md` 가 non-modal popover + anchored overlay 의 의 platform 의 의 의 자체 권장 (`popover` attribute + `popovertarget` + CSS `anchor-name`). Baseline: Chrome 114+ / Safari 17+ / Firefox 125+.
  - 본 WI 의 specific use case 의 측면 에서 platform API 의 채택 시 의 의무:
    1. **Dynamic anchor**: drag rect 의 자체 의 의 의무 의 `anchor-name` 을 ResizeObserver + CSS custom property 으로 매 frame 갱신 — Radix `react-popover` 의 의무 `<PopoverTrigger asChild>` 의 한 줄.
    2. **Light-dismiss**: platform API 의 의 의 자체 박제 (Esc + outside-click). 하지만 본 WI 의 의무 의 "popover 가 reviewing 상태 동안 가이드 박스 의 의무 유지" 는 light-dismiss 와 충돌 — popover 의 의 dismissed 시 가이드 박스 의 의 의무 의 자체 박제 의 의무. Radix `react-popover` 의 `onOpenChange` 의 의 의 자체 박제 의 의 자연.
    3. **Collision detection**: CSS Anchor Positioning 의 자체 박제 의 의무 — fallback chain 의 의 의 (`anchor-pos-options`) 의 의 의 의 의무. Safari 17.4+ 의 의 fallback 의 의무 — Radix `react-popover` 의 의 `@floating-ui/react-dom` 의 의 자체 battle-tested 박제.
    4. **React 의 state binding**: platform API 의 imperative `showPopover()` / `hidePopover()` 의 의 의무. React 의 `useState` 의 의 의무 의 자체 박제 (effect 의 의 sync 의 의 의무) — Radix 의 `open` / `onOpenChange` 의 declarative 의 의무 의 부재.
    5. **추정 의무**: 자체 박제 ~150 LOC + 새 edge case test + 의 의 의 의 의 (`@starting-style` 의 의 motion 의 의 의 박제 의 의무) — Radix `react-popover` 의 ~6 KB gzip + 0 LOC + battle-tested 의 의 의 의 의 의 의 trade.
  - **결정**: Radix `react-popover` 의 wrapping 의 의 의 의 채택. 이유: (a) project 의 의 의 6 개 의 의 Radix Primitives 의 의 의 의 의 일관 (DR-design-005 의 의 의 패턴), (b) implementation cost 의 측면 의 의 의 명백 우위, (c) frontend-design-pattern-agent 의 charter rule 의 의 의 자체 박제 의 의 의무 의 의 충족 (검토 완료 + 의 의 의 채택 근거 의 의 의무 의 박제). 향후 의 Popover API 의 의 baseline 의 의 의 100% 의 의 의 의 시 의 의 의 re-evaluate 의 의 의 의 (`tech-radar` skill 의 의 quarterly review 의 의 박제).
- **Radix `react-popover` 의 wrapping vs 자체 박제** — 기존 Radix family (dialog / dropdown / context-menu / radio-group / slot / toggle-group) 의 일관. 자체 박제 시 collision detection + keyboard nav + portal + a11y 의 무게 — 박제 의 비용 의 wrap 의 비용 보다 큼.
- **Pointer events: none on RubberBand** — RubberBand 의 자체 의 hit-test 책임 0. 부모 의 책임. 의도 — drag-target 의 결정 의 호출 측 의 자유 (root canvas vs frame interior 의 자체 결정).
- **state="drawing" 의 dimensions chip 의 always-on** — 사용자 의 정밀 측정 의 의무 (사용자 prompt 의 § 2.①). 차분 한 visual 의 token 의 의무 박제.

## 10. Open questions

- **Snap helper line 의 component-level vs hook-level** — Phase 1 의 의 박제 위치 — 현재 plan 은 RubberBand 의 자체 의 children 으로 render (호출 측 의 자체 snap-line 박제). Phase C 의 hook 의 책임 인지 확정 의 의무.
- **Popover 의 multiple open instances** — 한 화면 에 동시 open 가능 — vs single instance 강제 — Radix 의 default 는 multiple — WI-017 의 의도 는 single (한 drag 의 한 popover). 호출 측 의 책임 vs Popover 의 자체 의 single instance constraint 의 결정 의 의무.
- **`Popover.Arrow` 의 visual** — Aurora glass surface 의 arrow 가 backdrop-blur 와 가장자리 의 충돌 — Phase B 의 visual 검토 의 의무.

## 11. Cross-references

- WI-017 — `records/work-items/WI-017-rubber-band-component-creator.md`
- DR-012 — `records/decisions/DR-012-insertable-capability-registry.md`
- DR-design-005 — `records/design-reviews/DR-design-005-editor-chrome-primitives.md` (Radix wrapping 패턴 의 reference)
- DR-design-006 — `records/design-reviews/DR-design-006-ai-agentic-tooltip.md` (motion / token / reduced-motion 패턴 의 reference)
- Template: OS-root `docs/06-templates/DESIGN_REVIEW.md`
- 관련 메모: [[feedback-radix-slot-wrapper-forwardref]] (Popover 의 wrapping 의 의무 박제), [[feedback-tree-shaking-first]] (named const export 의 의무)
