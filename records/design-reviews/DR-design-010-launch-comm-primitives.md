# Design Review — DR-design-010

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-010 |
| Title | Launch communication primitives — `Banner` + `Tooltip` (generic) + `OnboardingCoachmark`. 3 신규 primitive · 텍스트 v1 launch in-app announcement·tooltip·coachmark 박제. |
| Triggering Work Item | WI-029 (Engineering Plan §7 Phase R5 — "In-app banner + tooltip wire + onboarding") |
| Triage outcome | **Grew × 3 (new primitives)** — Step 3 of design-system-triage. 3 primitive 신규 박제 (모두 `packages/design-system/src/components/` 부재 검증 완료) |
| Status | Proposed (pending agent reviews) |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (자동), `frontend-design-pattern-agent` (a11y / motion / focus management), hbpark |
| Date | 2026-05-26 |
| Target SLA | 2026-06-01 (LG-001 의 launch -1주 deadline — Pillar 1 Product + Pillar 6 Communications conditional close) |

## 1. Change in one sentence

`@weave/design-system` 에 **`Banner`** (region-level announcement — icon + headline + body + dismiss + persist localStorage), **`Tooltip`** (generic hover/focus single-line tooltip — AITooltip 와 분리), **`OnboardingCoachmark`** (anchor + arrow + 1-time persist popover) 3 primitive 박제. WI-029 의 R5 UI 컴포넌트 + 미래 모든 in-app announcement / 단순 tooltip / first-time hint 의 design-system foundation.

## 2. Why

**User problem this solves**: WI-029 텍스트 v1 launch (T-0 2026-06-08) 의 사용자 커뮤니케이션 3 surface — (a) "텍스트 편집이 새로워졌습니다" banner, (b) PropertiesPanel fontSize slider 옆 "글자 크기는 여기서 변경" tooltip, (c) 첫 텍스트 박스 생성 시 3-mode toggle onboarding hint. 이 surface 를 inline lookalike 로 박제 시 (i) design-system rule 위반, (ii) 미래 다른 launch communication 재사용 불가, (iii) a11y / motion / persist 박제 비용 매 surface 반복.

**Why existing primitives don't cover** (검증 완료 2026-05-26 — `packages/design-system/src/components/` 38 primitive 의 부재 확인):

- **`AITooltip`** — 3-region 합성 (context + actions + shortcut keycap). 단순 한 줄 hint 용도가 아님. 호버 의도가 AI agentic action 일 때만. fontSize slider 의 한 줄 안내에는 무거움.
- **`Popover`** (DR-design-007) — base 는 있음. OnboardingCoachmark 는 anchor + arrow + 1-time persist + first-mount-only show 의 추가 의미. Popover 위에 쌓이는 composition.
- **`Dialog`** — modal blocking, dismiss 강요. Banner 는 non-blocking + auto-dismiss 가능. Dialog 사용 시 launch announcement 가 사용자 작업 차단 — UX 무거움.
- **`Card`** — 의미가 다름 (콘텐츠 unit). Banner 는 system-level region (role="status" or role="region").
- **Toast** — 부재. 그러나 Banner 는 자동 회수 아닌 사용자 dismiss 의도 (1주 노출 후 자동 회수는 host 책임).

**Why now**:

- LG-001 (`records/launch-gates/LG-001-text-item-v1.md`) Pillar 1 Product + Pillar 6 Communications conditional close 의무.
- RISK-001 (`records/risks/RISK-001-text-item-v1.md`) condition #6 — "Launch note in-app banner 1주 + fontSize tooltip 1주 회수" 박제 의무.
- T-0 = 2026-06-08, R5 머지 deadline = launch -1주 ≈ **2026-06-01** (이미 Day -6).
- 3 primitive 가 동시 박제 → 단일 DR + 단일 design-system PR 의 효율.

## 3. Visual evidence

### Banner

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✨  텍스트 편집이 새로워졌습니다                                  [×] │
│      Figma·Canva 와 동일한 방식으로 텍스트를 다룰 수 있습니다.        │
│      [자세히 보기 →]                                                  │
└──────────────────────────────────────────────────────────────────────┘
   ↑ icon  ↑ headline + body              ↑ optional action  ↑ dismiss
```

- **`tone`** prop — `"info"` (default) / `"announcement"` / `"warning"`. Default aurora glass surface + accent-soft text.
- **`icon`** prop — optional ReactNode (✨ / ⚠ / ℹ etc).
- **`dismissible`** prop — default true. `×` 버튼 클릭 시 `onDismiss` 호출 + (host 가 localStorage 박제 의무).
- **`action`** prop — optional `{ label: string, onAction: () => void }` — `[자세히 보기 →]` 류 단일 action.
- **호스트가 mount 시 localStorage 확인** → 이전 dismiss 박제 있으면 null 반환 (primitive 는 controlled, persist 정책은 host).
- `role="status"` (info/announcement) / `role="alert"` (warning).

### Tooltip (generic)

```
        ┌─────────────────────────────────┐
        │ 글자 크기는 여기서 변경 —       │
        │ 코너 드래그는 박스만 조정합니다 │
        └─────────────┬───────────────────┘
                      ▼
                  [─────●────]   ← fontSize slider (anchor)
```

- Radix `Tooltip` 위 wrap. 단일 한 줄 (1-2 lines max).
- `<Tooltip content="...">` + 자식 (anchor) 으로 사용.
- `delayDuration` default 200ms (AITooltip 의 175ms 와 분리 — generic 은 살짝 느리게).
- `side` / `align` Radix native.
- `aria-describedby` 자동.
- **AITooltip 와 분리 의무**: AITooltip 는 "AI agentic 3-region 합성" 용도. 단순 hint 는 이 generic Tooltip.

### OnboardingCoachmark

```
                       ↑ arrow
        ┌─────────────────────────────────┐
        │ 💡 새로운 점                    │
        │ 텍스트 박스 위쪽에 ↔ ↕ □ 세    │
        │ 모드 토글이 있습니다.            │
        │                                 │
        │ ↔ Auto-W / ↕ Auto-H / □ Fixed  │
        │                          [닫기]  │
        └─────────────────────────────────┘
                      ▲ anchor (3-mode toggle)
```

- Radix `Popover` 위 wrap + arrow + 1-time `persistKey` (localStorage `weave.coachmark.<key>` = `"shown"`).
- `<OnboardingCoachmark persistKey="text-3-mode" anchor={<button>}>...</OnboardingCoachmark>` 패턴.
- 첫 mount 시 자동 open (persist 박제 없을 때만). 사용자 dismiss → 박제.
- `prefers-reduced-motion: reduce` 시 fade-only (slide 제거).
- focus trap optional (default off — 사용자 작업 차단 안 함).

## 4. Scope of the change

- [ ] New token — **없음** (기존 토큰 사용)
- [ ] Modified existing token — **없음**
- [x] New component primitive — **3개**:
  - `Banner` (`packages/design-system/src/components/Banner.tsx`)
  - `Tooltip` (`packages/design-system/src/components/Tooltip.tsx`)
  - `OnboardingCoachmark` (`packages/design-system/src/components/OnboardingCoachmark.tsx`)
- [ ] New variant on existing — **없음**
- [ ] New theme variant — **없음**
- [ ] Public-facing surface — **없음 (editor only)** — 단, 미래 marketing landing page 의 banner 재사용 가능

### 4-1. Banner API

```tsx
import { Banner } from "@weave/design-system";

<Banner
  tone="announcement"
  icon={<span aria-hidden>✨</span>}
  headline="텍스트 편집이 새로워졌습니다"
  dismissible
  onDismiss={() => persistDismissAt("text-v1", Date.now())}
  action={{ label: "자세히 보기 →", onAction: () => openHelp("text-editing") }}
>
  Figma·Canva 와 동일한 방식으로 텍스트를 다룰 수 있습니다.
</Banner>
```

- `tone`: `"info" | "announcement" | "warning"` (3 — variant ceiling 안전)
- `icon`: `ReactNode | undefined`
- `headline`: `string` (required)
- children: body content (`ReactNode`)
- `dismissible`: `boolean` (default `true`)
- `onDismiss`: `() => void`
- `action`: `{ label: string; onAction: () => void } | undefined`
- `role` 자동: `"status"` (info/announcement) / `"alert"` (warning)
- forwardRef<HTMLDivElement>

### 4-2. Tooltip API

```tsx
import { Tooltip } from "@weave/design-system";

<Tooltip content="글자 크기는 여기서 변경 — 코너 드래그는 박스만 조정합니다 (Figma 방식)" side="right">
  <NumberSlider value={fontSize} onValueChange={setFontSize} ... />
</Tooltip>
```

- `content`: `string | ReactNode` (single line preferred; 2-line max)
- `side`: `"top" | "right" | "bottom" | "left"` (Radix native)
- `align`: `"start" | "center" | "end"` (Radix native)
- `delayDuration`: `number` (default 200)
- `disabled`: `boolean` (default false — host 가 1주 후 회수 시 `disabled={isPastEndDate(...)}`)
- 자식 = anchor element
- forwardRef 는 Radix Tooltip 의 `asChild` 패턴으로 자식의 ref 전달 ([[feedback_radix_slot_wrapper_forwardref]] 의무)

### 4-3. OnboardingCoachmark API

```tsx
import { OnboardingCoachmark } from "@weave/design-system";

<OnboardingCoachmark
  persistKey="text-3-mode-toggle"
  anchor={<SegmentedControl ... />}
  headline="새로운 점"
  icon={<span aria-hidden>💡</span>}
  dismissLabel="닫기"
  side="bottom"
>
  텍스트 박스 위쪽에 ↔ ↕ □ 세 모드 토글이 있습니다.
  <ul>
    <li>↔ Auto-W — 글자 입력하면 박스가 가로로 자동 확장</li>
    <li>↕ Auto-H — 폭 고정, 줄바꿈에 따라 세로 자동</li>
    <li>□ Fixed — 폭·세로 모두 고정, 넘치는 텍스트는 잘림</li>
  </ul>
</OnboardingCoachmark>
```

- `persistKey`: `string` — localStorage `weave.coachmark.<persistKey>` 키. 첫 mount 시 박제 없으면 open, 있으면 노출 안 함.
- `anchor`: `ReactElement` — Radix Popover Trigger
- `headline`: `string`
- `icon`: `ReactNode | undefined`
- `dismissLabel`: `string` (i18n — default `"Got it"`)
- `side`: Radix native
- children: body (`ReactNode`)
- `onShown` / `onDismissed`: optional telemetry callbacks
- forwardRef<HTMLDivElement>

### 4-4. Tokens used (신규 0)

| Slot | Token |
|---|---|
| Banner surface | `--surface-overlay` + `backdrop-blur(--surface-blur)` |
| Banner border | `--surface-overlay-border` |
| Banner shadow | `--shadow-overlay` |
| Banner radius | `--radius-md` |
| Banner padding | `--space-3` / `--space-4` |
| Banner icon | `--accent` (announcement) / `--text-overlay-soft` (info) / `--warning` (warning) |
| Banner headline | `--text-overlay` font-medium |
| Banner body | `--text-overlay-soft` |
| Banner action | `--accent-link` underline-on-hover |
| Banner dismiss | `--text-overlay-soft` hover `--text-overlay` |
| Tooltip surface | `--surface-overlay-2` |
| Tooltip text | `--text-overlay` 12px |
| Tooltip arrow | `--surface-overlay-2` |
| Tooltip shadow | `--shadow-overlay-small` |
| Tooltip radius | `--radius-sm` |
| Coachmark surface | `--surface-overlay` |
| Coachmark border | `--accent-soft-border` (강조) |
| Coachmark headline | `--accent` |
| Coachmark body | `--text-overlay` |
| Coachmark dismiss button | Button `variant=ghost size=sm` (재사용) |
| Focus ring | `--focus-ring` |
| Motion (Banner enter) | `var(--motion-quick)` + slide-down |
| Motion (Banner exit) | `var(--motion-quick)` + fade |
| Motion (Tooltip enter/exit) | `var(--motion-quick)` |
| Motion (Coachmark enter) | `var(--motion-spring-soft)` + scale-from-anchor |

**New tokens 추가 0**. 기존 semantic + motion 토큰만 사용. `--warning` 은 이미 박제됨 (Aurora theme).

## 5. Consistency check

- [x] WCAG AA contrast — 모든 텍스트/icon 4.5:1+ (Banner announcement: `--accent` on `--surface-overlay` 검증 의무)
- [x] `prefers-reduced-motion: reduce` — Banner slide-down → fade-only, Coachmark spring-scale → fade-only. `useReducedMotion()` 패턴 (AITooltip 와 동일).
- [x] Focus-visible ring `--focus-ring` — Banner dismiss / action button, Tooltip 의 anchor focus 시 자동 표시, Coachmark dismiss button.
- [x] Keyboard navigation:
  - Banner: Tab/Shift+Tab 으로 action → dismiss 순. Esc 로 dismissible 시 dismiss.
  - Tooltip: focus on anchor 자동 표시 (Radix native).
  - Coachmark: 자동 open, dismiss button focusable + Enter/Space. Esc 로 dismiss.
- [x] Component reads tokens, not hard-coded — `cn() + var()`
- [x] Variant ceiling — Banner tone 3 (info/announcement/warning), Tooltip 무 variant, Coachmark 무 variant. 모두 ≤ 5.
- [x] Theme — Aurora / Mono / Vivid 3 theme 모두 회귀 검증 의무 (e2e visual baseline 별도 회수)
- [x] Token addition — N/A

## 6. Brand alignment

Aurora glass 톤 mirror — overlay surface + backdrop-blur reuse. Banner announcement icon (✨) 는 Aurora accent. Coachmark 의 spring-scale enter 는 weave 의 "playful but restrained" motion 철학 일관 (AITooltip / RubberBand 패턴). 모든 backdrop-filter 적용 element 는 `translateZ(0) + will-change: backdrop-filter` 의무 ([[feedback_backdrop_filter_under_transform]]).

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | (pending) | 3 primitive 토큰 resolution + variant ceiling + Hard rule 1·2 통과 + AITooltip 와의 책임 분리 검증 (Tooltip = 단일 hint / AITooltip = 3-region 합성). Banner tone 3 의 semantic 일관성. |
| `frontend-design-pattern-agent` | (pending) | a11y 의무 — Banner `role="status"`/`role="alert"`, Tooltip `aria-describedby`, Coachmark focus management (자동 open 시 focus 이동 정책 — default not-trap 결정 검증). `prefers-reduced-motion` 모든 motion 처리. localStorage persist 정책 host 책임 분리 검증. |
| `library-adoption-supply-chain-governance-agent` | N/A | 신규 의존 없음 — Radix Tooltip / Popover 이미 박제 (DR-design-007). motion/react 이미 박제. |
| `frontend-architecture-agent` | (pending) | controlled vs persist 패턴 — primitive 는 controlled (dismissible + onDismiss), host 가 localStorage 박제. 단일 source of truth 패턴 검증. forwardRef + named const export 준수. ESM + sideEffects:false + reflect-metadata 없음 ([[feedback_tree_shaking_first]]). |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-26 | Proposed. R5 UI Phase 2 진입 전 agent + 본인 sign-off 의무. LG-001 conditional close 의 launch -1주 deadline (2026-06-01) 직접 의존. |

## 9. Trade-offs accepted

- **Tooltip vs AITooltip 별도 primitive** — 합쳐서 AITooltip 의 `actions=[]` 빈 배열로 처리 가능했음. 그러나 AITooltip 의 3-region 합성 (context + actions + shortcut keycap) 의 의도가 다르고, generic 한 줄 tooltip 용도로 AITooltip mount 시 무거운 region layout 로직이 dead. 별도 primitive 가 깨끗 + tree-shake 친화.
- **Banner 의 persist 정책 host 책임** — primitive 가 localStorage 직접 mount 시 design-system 의 책임 범위 확장. host 가 mount 시 persist 확인 + dismissible 박제. primitive 는 controlled.
- **Coachmark 의 persistKey 는 primitive 책임** — Banner 와 반대 결정. Coachmark 는 "first-time-only" semantic 이 primitive 의 의도 (1회 노출) → persist 정책 이 본질. host 에 위임하면 매번 박제 의무 + 누락 위험.
- **Banner action 은 단일 only** — 두 개 이상 action 은 Dialog 의무 (decision tree). variant explosion 방지.
- **Banner 의 자동 회수 (1주 후) 는 host 책임** — primitive 의 dismissible 은 사용자 dismiss 만. host 가 "now > startDate + 7days 면 mount 안 함" 박제.
- **Tooltip 의 max line = 2** — 그 이상은 Popover 의무. variant explosion 방지.
- **Coachmark 의 focus trap default off** — 작업 흐름 차단 안 함. Dialog 가 아닌 hint. focus trap 필요한 경우는 future variant.

## 10. Open questions

- **Banner 의 i18n 정책** — primitive 가 props 로 string 받음 (host i18n). primitive 자체는 무 default text. dismissLabel 만 default `"Got it"` (영어) — host 가 한국어 의무 override. v2 에서 i18n context provider 추가 고려.
- **Coachmark 의 multi-step tour** — 1회 단일 박제. multi-step (next/prev) 은 future variant 또는 별도 primitive (`OnboardingTour`).
- **Banner 의 stacking** — 동시에 여러 Banner 가 mount 시 stack 정책. v1 = host 가 단일 mount 의무 (priority queue 없음). v2 = `BannerStack` primitive 고려.

## 11. Decision

- [ ] **Accepted** — proceed to Build (R5 UI Phase 2).
- [x] **Pending agent sign-off** — design-system-agent + frontend-design-pattern-agent + frontend-architecture-agent.
- [ ] **Rejected**
- [ ] **Deferred**

본 DR 박제 후 즉시 Phase 2 (primitive 구현) 진행. agent sign-off 는 implementation 박제 후 동시 검토 (token resolution / a11y / tree-shake 모두 코드 검증 가능 단계).

## 12. Follow-ups

- [ ] `packages/design-system/README.md` § "Adding a new component" 에 Banner / Tooltip / OnboardingCoachmark 박제
- [ ] `features/design-system/README.md` 컨트랙트 갱신 (3 신규 primitive 등재)
- [ ] R5 UI Phase 3 (apps/web surface wire) — TextV1LaunchBanner + fontSize tooltip wire + TextOnboardingHint
- [ ] R5 UI Phase 4 (e2e + verify) — `apps/web/e2e/text-v1-launch.spec.ts`
- [ ] R5 UI Phase 5 — WI-029 Status update + LG-001 conditional close

## 13. Cross-references

- WI-029: `records/work-items/WI-029-text-item-figma-equivalent.md` (§ Engineering Plan R5)
- LG-001: `records/launch-gates/LG-001-text-item-v1.md` (Pillar 1 + Pillar 6 conditional)
- RISK-001 condition #6: `records/risks/RISK-001-text-item-v1.md`
- Launch note (copy source): `docs/launch/TEXT_V1_LAUNCH_NOTE.md`
- DR-design-006 (AITooltip): `records/design-reviews/DR-design-006-ai-agentic-tooltip.md` — Tooltip 과의 책임 분리 reference
- DR-design-007 (Popover): `records/design-reviews/DR-design-007-rubber-band-popover-primitives.md` — Coachmark 의 base
- DR-design-009 (ContextualToolbar primitives): `records/design-reviews/DR-design-009-contextual-toolbar-primitives.md` — Grew × 7 직전 reference
- Engineering Plan: `features/text/ENGINEERING_PLAN.md` § R5
- 관련 메모: [[feedback_design_system_triage_mandatory]], [[feedback_radix_slot_wrapper_forwardref]], [[feedback_backdrop_filter_under_transform]], [[feedback_tree_shaking_first]]
