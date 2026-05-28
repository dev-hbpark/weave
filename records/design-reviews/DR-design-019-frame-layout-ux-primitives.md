# DR-design-019 — Frame layout-type UX primitives (icons + TrackSizeEditor)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-019 |
| Date | 2026-05-28 |
| Owner | hbpark |
| Component | `@weave/design-system` → `IconLayoutAbsolute` + `IconLayoutFlex` + `IconLayoutGrid` (3 new glyphs) + `TrackSizeEditor` (new primitive) |
| Work item | [WI-043](../work-items/WI-043-frame-layout-ux.md) — frame layout type UX for agocraft WI-020 (v1.1 auto-flex + auto-grid) |
| Risk | [RISK-002 C2.4](../../../agocraft/records/risks/RISK-002-layout-variants-expansion.md) (agocraft side — same DR sweep) |
| Triage Decision | **Step 3 — Grew × 4** (3 icons + 1 list editor) |

## Triage Walk

| Item | Step | Outcome |
|---|---|---|
| `IconLayoutAbsolute` / `IconLayoutFlex` / `IconLayoutGrid` | 3 Grew | ✅ — `Icon.tsx` 의 정적 glyph 집합에 3 SVG 추가. 동일 viewBox 24×24, stroke-only, currentColor, `baseProps` 공유. SRP 유지 (의미 표시). |
| `TrackSizeEditor` (list editor) | 3 Grew | ✅ — design-system 에 array list editor primitive 없음 (grep `list-editor\|array-input` → 0 hit). NumberSlider + SegmentedControl 조합으로 만들 수 있지만 composite reuse 후보가 weave 의 여러 paradigm 에서 곧 등장 (e.g. animation keyframe list, custom palette list) → design-system 격상 정당. |

| Step | Considered? | Result |
|---|---|---|
| 1. Reuse | ✓ | None of the existing primitives (SegmentedControl, NumberSlider, IconToggleGroup) match the array-list-with-add-remove + per-row-discriminated-union shape. |
| 2. Extend | ✓ | NumberSlider 는 단일 값. SegmentedControl 은 enum. 둘 다 별 책임이라 합치면 SRP 위반. |
| 3. Grew | ✅ | List + add/remove row + per-row discriminated controls (kind selector + value input). 한 컴포넌트 책임 명확. 별 파일로 격상. |
| 4. Escape | ✗ | weave 의 다른 future surface (animation keyframe list, palette swatch list) 도 동일 shape 필요 — escape 보다 격상 정당. |

## Context

WI-043 의 frame layout type UX (B1-B5) 에서 사용자가 "Grid" 를 ContextualToolbar 의 SegmentedControl 로 선택하면 default `AutoGridSpec({ columns: [trackFr(1)], rows: [trackFr(1)] })` 가 적용된다. 단일 cell 1×1 grid 는 시각적으로 absolute 와 구분 안 됨 — 사용자는 column / row 를 추가 / 편집 / 삭제할 수 있어야 한다.

`TrackSize = { kind: "ratio"; value } | { kind: "fr"; value } | { kind: "auto" }` 의 discriminated union 은 list 의 각 row 가 자체 sub-form 을 가져야 한다는 의미. SegmentedControl + NumberSlider 의 inline 조합은 작은 surface 면 가능하지만 add/remove 버튼 + drag-handle 재정렬 + Mixed-aware empty state 까지 합치면 별 primitive 가 정합.

또한 3 layout icon (Absolute/Flex/Grid) 은 B2 에서 inline 추가됐지만 정식 DR 박제는 본 문서에 합쳐 처리.

## Decision

### Icons (3 신규 in `Icon.tsx`)

```tsx
<IconLayoutAbsolute size={18} />  // frame with 2 free-floating child rects
<IconLayoutFlex size={18} />      // frame with 3 equal-width children in a row
<IconLayoutGrid size={18} />      // frame with 2×2 cell tessellation
```

- 모두 `Icon.tsx` 의 기존 `SvgRoot` 패턴 (viewBox 24×24, stroke-only, currentColor, `baseProps` 공유)
- Bundle 추가: ~80 bytes per icon (3 path 평균) — tree-shake 친화 (개별 named export)

### TrackSizeEditor API

```tsx
<TrackSizeEditor
  value={spec.columns}
  onValueChange={(next) => onFieldChange("columns", next)}
  aria-label="Grid columns"
  minRows={1}    // at least one track; remove disabled when length === 1
  maxRows={20}   // sanity cap, add disabled at limit
/>
```

```ts
export type TrackSize =
  | { readonly kind: "ratio"; readonly value: number }
  | { readonly kind: "fr"; readonly value: number }
  | { readonly kind: "auto" };

export interface TrackSizeEditorProps {
  readonly value: ReadonlyArray<TrackSize>;
  readonly onValueChange: (next: ReadonlyArray<TrackSize>) => void;
  readonly "aria-label"?: string;
  readonly minRows?: number;  // default 1
  readonly maxRows?: number;  // default 20
  readonly className?: string;
}
```

### Visual spec

- Vertical list (`role="list"`) of rows. Each row = `role="listitem"`.
- Each row:
  - 1×3 SegmentedControl<"ratio" | "fr" | "auto"> for kind (compact, 11px text, icon-less)
  - NumberSlider for `value` (visible only when kind ∈ {ratio, fr}; hidden + min-width preserved when kind === "auto")
  - Remove button (X icon, `aria-label="Remove track {index+1}"`, disabled when length === minRows)
- Footer:
  - "+ Add track" button (full width, ghost variant, disabled when length === maxRows)
- Empty state: not possible (minRows default 1 forces at least one).
- Mixed-aware: when the parent passes the same value across multi-selection comparator, behaves identically. When values differ across selected items, the parent renders a MixedBadge alongside the editor — the editor itself does not handle Mixed (kept narrow).

### A11y

- `role="list"` + per-row `role="listitem"`
- SegmentedControl carries `aria-label={\`Track ${index+1} kind\`}`
- NumberSlider carries `aria-label={\`Track ${index+1} value\`}`
- Remove button announces `Remove track {index+1}` via `aria-label`
- Add button: `aria-label="Add track"`
- Keyboard: Tab into each row → SegmentedControl arrow keys → Tab to value → Tab to remove → next row. Add button reachable via Tab from last row.

### Tree-shake (DR-002 3 gates)

- ESM only (matches the design-system package)
- `sideEffects: false` (existing package.json)
- No reflect-metadata / decorators
- Named const export

### Bundle estimate

- TrackSizeEditor itself: ~1.2 KB gzipped (estimate from analogous SegmentedControl + NumberSlider composition cost)
- 3 icons: ~0.25 KB gzipped combined

## Out of scope (future PR)

- Drag-handle reordering of rows (HTML5 DnD or pointer events). v1.1 manual remove + re-add only.
- Per-row preview swatches (visual hint of what `fr 2` vs `ratio 0.3` looks like at current parent width). v1.2 candidate.
- Padding 4-side editor as a separate primitive (currently 4 NumberSlider in Bar.Field is acceptable — promote when 3rd surface needs the same shape).
- AlignSelf / JustifySelf per-child editor — different surface (selected child, not parent). Lives in a per-child PropertiesPanel section, not the frame-background-section.

## Review-by

- `design-system-agent` — primitive promotion + visual sanity
- `frontend-architecture-agent` — a11y wrap + keyboard navigation
- `interaction-motion-philosophy-agent` — row add/remove micro-motion (use `motion-quick` token, no spring physics needed)

## Status

**Decided 2026-05-28.** Implementation lands in the same PR/commit as B6 of WI-043.
