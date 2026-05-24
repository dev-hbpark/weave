# Design Review — DR-design-009

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-009 |
| Title | ContextualToolbar primitive + 6 property-editor primitives (ColorPicker, NumberSlider, SegmentedControl, IconToggleGroup, DashPatternPicker, RangeSlider) — Canva-style 선택-기반 속성 편집 UI의 design-system foundation |
| Triggering Work Item | WI-020 |
| Triage outcome | **Grew (new primitives)** — Step 3 of design-system-triage. 7 primitive 신규 박제 (1 컨테이너 + 6 편집기) |
| Status | Proposed (pending agent reviews) |
| Owner (proposer) | hbpark |
| Reviewer(s) | `design-system-agent` (자동), `frontend-design-pattern-agent` (a11y / floating UI), `library-adoption-supply-chain-governance-agent` (Radix Slider 신규 의존), hbpark |
| Date | 2026-05-24 |
| Target SLA | 2026-05-28 (WI-020 Phase 1 진입 전) |

## 1. Change in one sentence

`@weave/design-system`에 **`ContextualToolbar`** (자식 fit horizontal bar, top-center positioning) + 6 property editor primitives — **`ColorPicker`** (Radix popover + swatch + hex input + alpha) , **`NumberSlider`** (Radix Slider + numeric input combo), **`RangeSlider`** (dual-thumb slider for trim/crop ranges), **`SegmentedControl`** (Radix toggle-group으로 enum 선택), **`IconToggleGroup`** (icon button row toggle), **`DashPatternPicker`** (predefined stroke dash arrays) — 박제. WI-020 의 ContextualToolbar 및 향후 모든 속성 편집 UI의 design-system foundation.

## 2. Why

**User problem this solves**: WI-020 의 image / video / shape 속성 편집 UI를 inline lookalike로 박제 시 (a) 회귀 위험, (b) Hard rule 1 ("Every UI component lives in `packages/design-system/`") 위반, (c) 미래 다른 컴포넌트가 같은 editor를 재사용 못함. 표준 primitive 박제로 한 번에 해결.

**Why existing primitives don't cover**:
- **`Switch`** (DR-design-008) — boolean 토글만. enum 선택은 불가.
- **`RadioTile`** — full-cell visual radio. 작은 toolbar 안에 들어갈 segmented control 의도와 다름.
- **`Popover`** (DR-design-007) — base는 있음. ColorPicker가 이 위에 쌓이는 composition.
- **`Toolbar` + `ToolbarDivider`** — 이미 존재 (Phase 9). 그러나 select-driven floating context bar 가 아닌 캔버스 fixed toolbar 용도.

**Why now**:
- WI-020 Phase 1 진입 전 의무.
- 표준 property editor가 향후 도메인 (slide attrs / hotspot attrs / present-mode controls) 에서도 재사용 가능 — 한 번 박제로 다년 가치.

## 3. Visual evidence

Pre-visual sketch:

```
┌─ ContextualToolbar ───────────────────────────────────────────────────────┐
│  [■ Fill ▾] │ [▭ Stroke ▾] │ [○─── 80%] │ [▭ R 12 ─] │ [↻ 0°] │ [⋯]      │
└────────────────────────────────────────────────────────────────────────────┘
   ColorPicker     ColorPicker    Opacity    BorderRadius   Rotation  More
                                  NumberSlider                        (Dropdown)
```

Detail per primitive:

**ColorPicker** (popover trigger):
```
[■]  ← swatch button (10x10 px, current color, border 1px ridge)
 │
 ▼ popover (aurora glass):
 ┌─────────────────┐
 │ [#] color input │
 │ R G B sliders   │
 │ Alpha slider    │
 │ [presets row]   │
 └─────────────────┘
```

**NumberSlider** (inline slider + numeric input):
```
[○────────  80] %    ← thumb + track + number input
```

**SegmentedControl**:
```
[ Cover | Contain | Fill | None ]  ← 4 segments, one pressed
```

**IconToggleGroup**:
```
[ ⬛ ⬜ ⚫ ]   ← 3 icon options, exclusive
```

**RangeSlider** (dual thumb for trim):
```
0:00 [─○────○──] 1:30  ← two thumbs (start + end)
```

**DashPatternPicker**:
```
[━━━━]  ← solid
[─ ─ ─]  ← dashed
[· · ·]  ← dotted
[─·─·]   ← dash-dot
```

## 4. Scope of the change

- [ ] New token — **없음** (기존 토큰 사용)
- [ ] Modified existing token — **없음**
- [x] New component primitive — **7개**:
  - `ContextualToolbar` + `ContextualToolbar.Section` + `ContextualToolbar.Divider` (`packages/design-system/src/components/ContextualToolbar.tsx`)
  - `ColorPicker` (`ColorPicker.tsx`) — Radix popover wrap + swatch + hex + RGBA sliders + presets
  - `NumberSlider` (`NumberSlider.tsx`) — Radix Slider + Input combo
  - `RangeSlider` (`RangeSlider.tsx`) — Radix Slider dual-thumb
  - `SegmentedControl` (`SegmentedControl.tsx`) — Radix toggle-group wrap
  - `IconToggleGroup` (`IconToggleGroup.tsx`) — Radix toggle-group with icon-only items
  - `DashPatternPicker` (`DashPatternPicker.tsx`) — 4-6 preset visual buttons
- [ ] New variant on existing — **없음**
- [ ] New theme variant — **없음**
- [ ] Public-facing surface — **없음 (editor only)**

### 4-1. ContextualToolbar API

```tsx
import {
  ContextualToolbar,
} from "@weave/design-system";

<ContextualToolbar aria-label="Image properties">
  <ContextualToolbar.Section label="Fill">
    <ColorPicker value={fill} onValueCommit={...} />
  </ContextualToolbar.Section>
  <ContextualToolbar.Divider />
  <ContextualToolbar.Section label="Opacity">
    <NumberSlider value={opacity} onValueChange={...} min={0} max={1} step={0.01} suffix="%" />
  </ContextualToolbar.Section>
  {/* ... */}
</ContextualToolbar>
```

Layout:
- horizontal flex, items `gap-2`
- container backdrop-blur + glass surface
- `position: absolute` 정책은 host가 결정 (top-center placement는 DesignPage 내 wrapper에서)

### 4-2. ColorPicker API

```tsx
<ColorPicker
  value={paintSpec}             // PaintSpec | string (string fallback to solid)
  onValueCommit={(p: PaintSpec) => editor.exec("weave.shape.update", { id, patch: { fill: p } })}
  presets={paintPresets}        // optional, default 12 swatches
  supportsGradient={true}       // when true, shows gradient tab
/>
```

- Trigger: small swatch button (current color visualized)
- Popover (Radix): hex input + RGBA sliders + preset row + gradient tab (if `supportsGradient`)
- `onValueCommit` fires on popover close OR explicit "Apply" press OR 250ms throttle during drag

### 4-3. NumberSlider API

```tsx
<NumberSlider
  value={opacity}               // 0..1
  onValueChange={setOpacity}    // continuous (throttled in host)
  onValueCommit={commitOpacity} // on pointer-up (single undo step)
  min={0} max={1} step={0.01}
  suffix="%"
  format={(v) => `${Math.round(v * 100)}`}
/>
```

- Radix Slider thumb + track
- Adjacent numeric input (typed value 직접 변경 가능)
- onValueChange = transient updates (preview)
- onValueCommit = drop / blur (single history entry)

### 4-4. SegmentedControl API

```tsx
<SegmentedControl
  value={fit}
  onValueChange={setFit}
  options={[
    { value: "cover",   label: "Cover" },
    { value: "contain", label: "Contain" },
    { value: "fill",    label: "Fill" },
    { value: "none",    label: "None" },
  ]}
/>
```

### 4-5. Tokens used

| Slot | Token |
|---|---|
| Toolbar surface | `--surface-overlay` + `backdrop-blur(--surface-blur)` |
| Toolbar border | `--surface-overlay-border` |
| Toolbar shadow | `--shadow-overlay` |
| Toolbar radius | `--radius-md` |
| Section label | `--text-overlay-soft` 11px font-mono |
| Divider | `--surface-overlay-border` 1px |
| ColorPicker swatch border | `--border-strong` |
| Slider track (off) | `--surface-overlay-2` |
| Slider track (on) | `--accent` |
| Slider thumb | `--text-overlay` + `--shadow-thumb` |
| SegmentedControl pressed | `--accent-soft` + `--accent` text |
| Focus ring | `--focus-ring` |
| Motion (Toolbar enter/exit) | `var(--motion-quick)` + `var(--motion-spring-soft)` |
| Motion (slider drag) | `var(--motion-quick)` |

**New tokens 추가 0**. 기존 semantic + motion 토큰만 사용.

## 5. Consistency check

- [x] WCAG AA contrast — 모든 텍스트 / icon 4.5:1+
- [x] `prefers-reduced-motion: reduce` — Toolbar enter/exit, slider drag transitions short-circuit via motion lib `useReducedMotion()`
- [x] Focus-visible ring `--focus-ring` — 모든 interactive
- [x] Keyboard navigation:
  - Toolbar: Tab/Shift+Tab으로 section 간 이동
  - Slider: ← → 화살표
  - SegmentedControl: ← → 화살표 (Radix native)
  - ColorPicker: Enter로 popover open, Esc로 close
- [x] Component reads tokens, not hard-coded — `cn() + var()`
- [x] Variant ceiling — ContextualToolbar size 1, ColorPicker tabs ≤ 3, SegmentedControl options ≤ 6 (compose by App if more)
- [x] Theme — Aurora / Mono / Vivid 3 theme의 회귀 의무 (Phase G e2e)
- [x] If this is a token — N/A

## 6. Brand alignment

Aurora glass 톤 mirror — overlay surface + backdrop-blur reuse. Slider thumb의 subtle glow는 Aurora의 accent와 일관. 모든 backdrop-filter 적용 element는 `translateZ(0) + will-change: backdrop-filter` 의무 ([[feedback_backdrop_filter_under_transform]]).

## 7. Agent sign-offs

| Agent | Verdict | Notes |
|---|---|---|
| `design-system-agent` | (pending) | 7 primitive 토큰 resolution + variant ceiling + Hard rule 1·2 통과 검증. ContextualToolbar의 위치 정책 (자체 positioning vs host responsibility) 확인. |
| `frontend-design-pattern-agent` | (pending) | a11y 의무 — ContextualToolbar의 `role="toolbar"` + `aria-label`, ColorPicker의 popover focus management, Slider의 keyboard navigation. Reduced-motion 적용 검증. |
| `library-adoption-supply-chain-governance-agent` | (pending) | `@radix-ui/react-slider` 신규 의존 — Radix family 9번째 (기존 8: context-menu, dialog, dropdown-menu, popover, radio-group, slot, switch, toggle-group). 동일 vendor/maintenance/MIT. Bundle ~4KB gzip. APPROVED_LIBRARY_CATALOG 업데이트. |
| `frontend-architecture-agent` | (pending) | onValueChange vs onValueCommit 패턴의 단일 source of truth, 컨트롤드 컴포넌트 패턴 검증. |

## 8. Human sign-off (design team)

| Name | Role | Date | Notes |
|---|---|---|---|
| hbpark | Owner | 2026-05-24 | Proposed. WI-020 Phase 1 진입 전 agent + 본인 sign-off 의무. |

## 9. Trade-offs accepted

- **ColorPicker 의 Radix popover wrap** — 자체 박제 시 popover position/collision/focus trap 박제 부담. Radix family 일관 + 0 LOC 박제 비용 이득.
- **NumberSlider 의 Radix Slider wrap** — 자체 slider 박제 시 thumb dragging의 cross-browser quirk, keyboard nav, value clamping 모두 박제 의무. Radix Slider가 모두 처리.
- **`@radix-ui/react-slider` 신규 의존** — Radix family 9th. ~4KB gzip + 0 LOC + battle-tested.
- **ColorPicker 의 gradient 지원** — initial 라운드는 solid + linear-gradient만. radial-gradient는 v2.
- **No "Eyedropper" tool** — browser EyeDropper API는 still limited (Chromium only). v2 feature.
- **ContextualToolbar 의 positioning은 host 책임** — primitive 자체는 horizontal bar 만. top-center 정책은 DesignPage 의 wrapper. 이로써 다른 host (예: present-mode toolbar at bottom) 가 같은 primitive 재사용 가능.
- **path sub-kind 의 d 편집 미지원** — security + UX 고려; v1 ContextualToolbar는 preset / import 만.

## 10. Open questions

- **ColorPicker preset 의 도메인 별 default** — image filter의 preset (sepia / b&w 등) 은 ColorPicker 외부 (preset toolbar)에서? v2 결정.
- **Multi-selection** (DR-014 §"Decision C") — v2 deferred.
- **Drag handle** — ContextualToolbar의 위치 조정 가능 여부. v1 fixed, v2 draggable.

## 11. Cross-references

- WI-020 — `records/work-items/WI-020-item-primitives-toolbar.md`
- DR-014 — `records/decisions/DR-014-contextual-toolbar.md`
- DR-design-005 — `records/design-reviews/DR-design-005-editor-chrome-primitives.md` (Toolbar precedent)
- DR-design-007 — `records/design-reviews/DR-design-007-rubber-band-popover-primitives.md` (Popover wrap pattern)
- DR-design-008 — `records/design-reviews/DR-design-008-panel-switch-badge-kbd.md` (Switch wrap precedent)
- agocraft DR-023 / DR-024 — 신규 item schemas
- 관련 메모: [[feedback_radix_slot_wrapper_forwardref]], [[feedback_backdrop_filter_under_transform]], [[feedback_tree_shaking_first]]
