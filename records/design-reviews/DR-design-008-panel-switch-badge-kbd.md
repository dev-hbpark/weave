# Design Review — DR-design-008

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-008 |
| Title | Panel + Switch + Badge + Kbd primitives — Peek mode Inspector + 전반 weave UI에 필요한 4 missing primitives의 통합 발행 |
| Triggering Work Item | WI-019 |
| Triage outcome | **Grew (new primitives)** — Step 3 of design-system-triage decision tree. 4 primitives 동시 박제. Panel은 ThumbnailPanel + PropertiesPanel + StackInspector 3 consumer의 통합 primitive. |
| Status | Proposed (pending agent reviews) |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (자동), `frontend-design-pattern-agent` (a11y, focus, motion), `library-adoption-supply-chain-governance-agent` (Radix Switch 신규 의존 가능성), hbpark |
| Date | 2026-05-24 |
| Target SLA | 2026-05-26 (WI-019 Phase 2 진입 전) |

## 1. Change in one sentence

`@weave/design-system`에 **`Panel`** (sliding side panel, header + scrollable body + optional footer/statusbar), **`Switch`** (Radix wrapper, aurora-glass surface), **`Badge`** (inline label with variant), **`Kbd`** (keyboard hint chip) 4 primitives 동시 박제. WI-019 Peek mode Inspector + 전반 weave editor의 다용도 사용처에 공급.

## 2. Why

**User problem this solves**: WI-019의 Point Stack Inspector + 미래의 PropertiesPanel / ThumbnailPanel 통합 + 모든 hotkey hint 표시 + 모든 inline metadata badge가 동일 shape의 primitive 부재로 inline lookalike로 박제될 위험. design system이 이를 흡수.

**Why existing primitives don't cover**:

- **`Dialog`** (DR-design-005) — modal, blocks interaction. Inspector + side panel은 non-modal + always-visible (when active).
- **`Popover`** (DR-design-007) — transient floating, anchored. Inspector는 stable side panel, dock to viewport edge.
- **`AITooltip`** — hover hint, ephemeral. Kbd는 inline visible chip, not hover-triggered.
- **`RadioTile`** — multi-option choice. Switch는 single boolean toggle (1-hop expand 같은).
- **(없음)** Badge / inline label primitive — z 표시, "RELATED" 태그, status 등.

**Why now**:
- WI-019 Phase 2 진입 전 의무 (Inspector를 inline lookalike로 박제 시 회귀 + Hard rule 1 위반).
- ThumbnailPanel (Phase 10) + PropertiesPanel (Phase 13)이 이미 feature-local로 존재 — Panel primitive 출시 시 두 panel을 wrap으로 migrate해 visual + a11y 통일.
- Kbd는 PoC에서 사용한 형태 외에도 hotkey UX 전반 (Cmd+Z hint, Shift+drag constrain hint 등)에 재사용 임박.
- Badge는 z=N 표시 외에 frame label / status indicator / role tag 등 다용도.

## 3. Visual evidence

Pre-visual:

```
Inspector layout (Panel + Switch + Badge + Kbd 동시 사용):
┌────────────────────────────────────┐
│ Point Stack Inspector              │ ← Panel.Header (sticky)
│ 3 at cursor · +2 related           │ ← Panel.Subtitle
│ ───────────────────────────────────│ ← Panel divider
│ ┌────────────────────────────────┐ │
│ │ ▣ Item A         [RELATED] z=4 │ │ ← stack row (Badge "RELATED" + Badge z=4)
│ ├────────────────────────────────┤ │
│ │ ▤ Item B                  z=3  │ │
│ ├────────────────────────────────┤ │
│ │ ▥ Item C                  z=2  │ │
│ ├────────────────────────────────┤ │
│ │ ▦ Item D         [RELATED] z=1 │ │
│ ├────────────────────────────────┤ │
│ │ ▧ Item E                  z=0  │ │
│ └────────────────────────────────┘ │ ← Panel.Body (scrollable)
│ ───────────────────────────────────│
│ □ 1-hop neighbors                  │ ← Switch (off)
│                                    │
│ Hold [Space] to peek               │ ← Kbd chip "Space"
│ ───────────────────────────────────│
│ x: 246 y: 380  ·  stack: 5         │ ← Panel.Statusbar (sticky bottom)
└────────────────────────────────────┘
```

Visual states / variants:

- **Panel** — `position: docked-right | docked-left | floating`, `width: sm | md | lg` (240 / 320 / 480 px). `header`, `body`, `footer | statusbar` slots. Aurora-glass surface (DR-design-005 mirror).
- **Switch** — `checked | unchecked` × `default | small`. Radix `react-switch` thumb + track.
- **Badge** — `variant: default | accent | success | warning | info` × `size: xs | sm`. Inline `<span>` shape.
- **Kbd** — Single key (`Space`, `⌘`, `↑`) 또는 combo (`Cmd+Z`). Inline `<kbd>` shape, monospace, subtle ridge.

## 4. Scope of the change

- [ ] New token — **없음** (기존 토큰만 사용)
- [ ] Modified existing token — **없음**
- [x] New component primitive — **4개**:
  - **`Panel`** (`packages/design-system/src/components/Panel.tsx`)
  - **`Switch`** (`packages/design-system/src/components/Switch.tsx`)
  - **`Badge`** (`packages/design-system/src/components/Badge.tsx`)
  - **`Kbd`** (`packages/design-system/src/components/Kbd.tsx`)
- [ ] New variant on existing — **없음**
- [ ] New theme variant — **없음**
- [ ] Public-facing surface — **현재 없음** (editor only). 향후 marketing landing의 "live demo"에서 잠재 사용.

### 4-1. `Panel` API

```tsx
import { Panel } from "@weave/design-system";

<Panel position="docked-right" width="md" aria-label="Point Stack Inspector">
  <Panel.Header>
    <Panel.Title>Point Stack Inspector</Panel.Title>
    <Panel.Subtitle>3 at cursor · +2 related</Panel.Subtitle>
  </Panel.Header>
  <Panel.Body>
    {/* scrollable content */}
  </Panel.Body>
  <Panel.Footer>
    <Switch checked={expandRelated} onCheckedChange={setExpandRelated}>
      1-hop neighbors
    </Switch>
  </Panel.Footer>
  <Panel.Statusbar>
    <span>x: {x} y: {y}</span>
    <span>stack: {n}</span>
  </Panel.Statusbar>
</Panel>
```

Compound component pattern (Header/Title/Subtitle/Body/Footer/Statusbar)으로 layout 자유. `position` prop이 fixed dock 또는 floating 결정. floating일 때는 drag handle 박제 (deferred to Phase 2 if not needed for WI-019).

### 4-2. `Switch` API

```tsx
import { Switch } from "@weave/design-system";

<Switch
  checked={expandRelated}
  onCheckedChange={setExpandRelated}
  size="default"  // | "small"
>
  1-hop neighbors
</Switch>
```

`@radix-ui/react-switch` thin wrapper. Aurora-glass thumb + track. `asChild` 미지원 (Switch는 자체 root). label은 children으로 받음 → 내부 `<label>` wraps `<Switch.Root>` + `<Switch.Thumb>` + label text.

[[feedback_radix_slot_wrapper_forwardref]] 의무 — 본 컴포넌트는 asChild 미사용이므로 ref forwarding 직접 박제 (forwardRef + rest props 전달).

### 4-3. `Badge` API

```tsx
import { Badge } from "@weave/design-system";

<Badge variant="default" size="xs">z=4</Badge>
<Badge variant="accent" size="xs">RELATED</Badge>
<Badge variant="success" size="sm">Active</Badge>
```

Inline `<span>`, pure visual. variant × size matrix = 5 × 2 = 10 visual states. variant ceiling 5 ≤ 5 OK.

### 4-4. `Kbd` API

```tsx
import { Kbd } from "@weave/design-system";

<Kbd>Space</Kbd>
<Kbd combo>Cmd+Z</Kbd>          // combo prop = + separator visible
<Kbd size="sm">⌘</Kbd>
```

Inline `<kbd>` HTML element (semantic). monospace font, subtle background + ridge border. `combo` prop이 `+` 자리에 separator visual.

### 4-5. Tokens used

| Slot | Token | Purpose |
|---|---|---|
| Panel surface | `--surface-1` + `backdrop-blur(--surface-blur)` | aurora glass |
| Panel border (docked) | `--border-strong` 1 px | dock edge separation |
| Panel header text | `--text-strong` 13px semibold | title |
| Panel subtitle text | `--text-soft` 11px | meta |
| Panel statusbar text | `--text-soft` 11px font-mono | data |
| Panel divider | `--border-soft` 1 px | section separator |
| Panel shadow (floating) | `--shadow-glass` | elevated |
| Switch track (off) | `--surface-2` | rest |
| Switch track (on) | `--accent` | checked |
| Switch thumb | `--surface-0` + `--shadow-thumb` | knob |
| Badge default bg | `--surface-2` | neutral |
| Badge default text | `--text-soft` | label |
| Badge accent bg | `--accent-soft` | highlighted |
| Badge accent text | `--accent` | highlighted text |
| Badge success bg | `--success-soft` | status |
| Badge warning bg | `--warning-soft` | status |
| Badge info bg | `--info-soft` | status |
| Badge font | font-mono 10-11px | tight |
| Kbd background | `--surface-2` | chip rest |
| Kbd border | `--border-strong` | ridge |
| Kbd text | `--text-strong` | crisp |
| Kbd font | font-mono 11px | semantic |
| Motion (Panel enter/exit) | `var(--motion-quick)` + `var(--motion-spring-soft)` | slide in/out |
| Motion (Switch thumb) | `var(--motion-quick)` | toggle |

**New tokens 추가 0**. 기존 semantic + motion 토큰만 사용.

## 5. Consistency check

- [x] WCAG AA contrast — Panel surface + text-strong = ≥ 7:1 (already verified DR-design-005). Badge variants 모두 ≥ 4.5:1.
- [x] `prefers-reduced-motion: reduce` — Panel slide animation, Switch thumb transition 모두 motion lib `useReducedMotion()` short-circuit.
- [x] Focus-visible ring `--focus-ring` — Switch, Panel scrollable body, interactive children 모두.
- [x] Keyboard navigation — Switch space/enter toggle (Radix 자체). Panel body는 scrollable; arrow keys / Tab으로 children 탐색.
- [x] Component reads tokens, not hard-coded — `cn() + var()` 패턴.
- [x] Variant ceiling — Panel position 3, width 3 → ≤ 5. Switch size 2. Badge variant 5 × size 2. Kbd size 2 + combo prop 1. 모두 ≤ 5.
- [x] Theme — Aurora / Mono / Vivid 3 theme의 회귀 의무 (Phase G e2e).
- [x] If this is a token — N/A.

## 6. Brand alignment

(public-facing deferred이므로 약식)

Aurora glass의 톤을 mirror — Panel + Switch 모두 `--surface-1 / --surface-2 + backdrop-blur` reuse. Badge + Kbd의 subtle ridge가 editor chrome의 일관 — DR-design-005의 IconButton hover state와 같은 ridge weight.

Mono theme — backdrop-blur fallback이 contrast 통과 의무. Vivid theme — accent variant가 더 강한 saturation.

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | (pending) | 4 primitives의 토큰 resolution 검증 + variant ceiling 통과 + Hard rule 1·2 통과. ThumbnailPanel + PropertiesPanel을 Panel wrap으로 migrate하는 follow-up plan 필요. |
| `frontend-design-pattern-agent` | (pending) | a11y 의무 — Panel의 `role="region"` + `aria-label`, Switch의 Radix native a11y, Kbd의 `<kbd>` semantic. Switch의 controlled vs uncontrolled mode boundary. Reduced-motion short-circuit verify. |
| `library-adoption-supply-chain-governance-agent` | (pending) | `@radix-ui/react-switch` 신규 의존 — Radix family 8번째 (기존 7: context-menu, dialog, dropdown-menu, popover, radio-group, slot, toggle-group). 동일 vendor + maintenance + MIT. Bundle ~3KB gzip. APPROVED_LIBRARY_CATALOG expansion 의무. |
| `frontend-architecture-agent` | (pending) | Panel compound component pattern (DR-design-005 Dialog의 mirror), ThumbnailPanel / PropertiesPanel migration plan 검토. |
| `seo-ai-visibility-agent` | N/A | public surface 미적용. |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-24 | Proposed. WI-019 Phase 2 진입 전 agent + 본인 sign-off 의무. |

## 9. Trade-offs accepted

- **Panel compound vs single component with slots** — compound (Header/Body/Footer/Statusbar sub-components)을 채택. DR-design-005 Dialog의 정착 패턴 mirror. layout 자유도 + a11y 명시.
- **Switch는 `@radix-ui/react-switch` wrap** — 자체 박제 시 a11y / keyboard / animation 모두 박제 필요. Radix family 일관 + 3KB gzip 비용 acceptable.
- **Badge는 자체 박제** (Radix 없음) — pure visual primitive, a11y 의무 없음 (semantic `<span>`).
- **Kbd는 자체 박제** — semantic `<kbd>` HTML element + 자체 styling. native HTML 활용.
- **Panel.Footer vs Statusbar 구분** — Footer는 action / control 영역, Statusbar는 read-only metadata. 별 slot으로 의도 명시 + a11y 분리 (`role="contentinfo"` vs `role="status"`).
- **dock 좌/우 vs floating** — 본 WI에서 docked-right만 사용. floating은 deferred (drag handle 박제 부담). Phase 2에서 ThumbnailPanel migration 시 floating 필요 시 추가.
- **ThumbnailPanel / PropertiesPanel migration은 별 PR로 분리** — WI-019 Phase 1에서 Panel primitive 출시 + Inspector 채택 후, follow-up PR로 2개 panel migrate. risk 격리.

## 10. Open questions

- **Panel의 collapsible 여부** — header click으로 body collapse 의도가 미래에 있을 가능성. 현재는 미박제 (always-expanded). Phase 2에서 ThumbnailPanel 사용 패턴 보고 결정.
- **Switch label 위치** — leading vs trailing. 현재 children = trailing (체크박스 표준). 만약 leading 필요 시 prop 추가.
- **Badge의 dot variant** — color dot only (no label)이 status indicator로 흔함. 현재 미박제. Phase 2 follow-up 가능.
- **Kbd의 platform-aware rendering** — Mac은 ⌘, Win은 Ctrl. 현재는 props로 받은 그대로 표시. 자동 변환은 별 helper (`<Kbd platform />`)로 deferred.

## 11. Cross-references

- WI-019 — `records/work-items/WI-019-zorder-peek-ui.md`
- DR-013 — `records/decisions/DR-013-peek-mode-adapter.md`
- DR-design-005 — `records/design-reviews/DR-design-005-editor-chrome-primitives.md` (compound pattern reference)
- DR-design-007 — `records/design-reviews/DR-design-007-rubber-band-popover-primitives.md` (Radix wrapping reference)
- Template: OS-root `docs/06-templates/DESIGN_REVIEW.md`
- 관련 메모: [[feedback_radix_slot_wrapper_forwardref]], [[feedback_tree_shaking_first]], [[feedback_design_system_triage_mandatory]]
