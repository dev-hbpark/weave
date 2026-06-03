# DR-design-029 — IconChart glyph + ChartSection panel (data-driven chart)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-029 |
| Date | 2026-06-02 |
| Owner | hbpark |
| Component | `@weave/design-system` → `IconChart` (1 new static glyph in `Icon.tsx`); app-local `ChartSection` (composed from existing `ContextualToolbar` + `Select` primitives) |
| Work item | [WI-077](../work-items/WI-077-chart-item-and-dataset.md) — chart item + dataset 데이터 관리 아이템 |
| Triage Decision | **Step 3 — Grew × 1** (one new icon primitive); **Step 1 — Reuse** for the panel |

## Triage Walk

| Step | Considered? | Result |
|---|---|---|
| 1. Reuse | ✓ | **Panel reuses** existing primitives — `ContextualToolbar` (Bar.Kind/Quick/More/Field), `Select`, `MixedBadge`, `OpacityControl` — exactly like `LineSection`/`QrSection`. No new panel primitive. **Icon**: no existing glyph reads as "chart/graph". `IconLayoutGrid` (grid layout), `IconImage`, `IconDocLines` all carry unrelated meaning; reusing one would mislabel the add-menu entry. |
| 2. Extend | ✓ | Icons are atomic stroke glyphs — nothing to extend; a variant prop on an unrelated icon would overload semantics. |
| 3. Grew | ✅ | Add one `IconChart` const following the shared `SvgRoot` pattern (axis + 3 ascending bars). |
| 4. Escape | ✗ | The glyph is needed on the header add-menu now and the `chart` kind's `Bar.Kind` header reuses the same glyph — a shared primitive beats an app-local one-off (same reasoning as DR-design-022). |

## Context

WI-077 adds the `chart` DomainKind. Two UI surfaces need design-team sign-off:

1. **Add-menu entry** ("차트") under a new "데이터" group in `DesignHeader` — needs a
   recognizable glyph distinct from the shape/media/qr entries.
2. **ChartSection** — the `chart` kind's contextual-toolbar panel: chartType
   (막대/선/파이) + column→role encoding (항목 열 / 값 열) + opacity.

A third surface — the **dataset editing table panel** (row/column CRUD) — is
deferred to WI-077 Phase 5 and will extend this record (or get its own
DR-design) since a data-grid is a genuinely new interaction primitive.

## Decision

### IconChart (new glyph)

```tsx
export const IconChart = forwardRef<SVGSVGElement, IconProps>(function IconChart(props, ref) {
  return (
    <SvgRoot ref={ref} {...props}>
      <path d="M4 4v16h16" />               {/* L-shaped axis */}
      <rect x="7" y="12" width="3" height="5" rx="0.5" />
      <rect x="12" y="9" width="3" height="8" rx="0.5" />
      <rect x="17" y="6" width="3" height="11" rx="0.5" />
    </SvgRoot>
  );
});
```

- **Metaphor**: an axis with three ascending bars — the universal bar-chart
  glyph. Reads as "chart" at 16px in the add-menu and 18px in `Bar.Kind`.
- Same `SvgRoot` contract as every sibling glyph: viewBox 24×24, stroke-only,
  `currentColor`, shared `baseProps`, `size` prop.
- Distinct from `IconLayoutGrid` (cells), `IconImage` (picture), `IconQr`
  (modules). The axis + bars silhouette is the differentiator.

### ChartSection (no new primitive)

Composed entirely from existing design-system parts — `Bar.Kind/Quick/More/Field`,
`Select`, `MixedBadge`, `OpacityControl` — mirroring `LineSection`. The chart's
referenced dataset columns drive the encoding `Select` options, resolved via the
`DatasetContext` (`useResolveDataset()`) already mounted on the design surface.

### No emoji

Per the workspace "no emoji in UI — always icons" rule, the add-menu entry ships
with the `IconChart` SVG from the first commit.

### Tree-shake (DR-002 3 gates)

ESM only / `sideEffects: false` / no reflect-metadata / named const export — all
satisfied (same as every sibling icon).

### Bundle estimate

~0.2 KB gz (axis path + three rects, no new runtime dependency). ChartSection
adds no new primitive → no design-system bundle delta.

## Verification

- typecheck (design-system + web): green (see WI-077 / ENGINEERING_PLAN Phase 4).
- e2e `chart-item.spec.ts`: chart add → renders bars, chartType switch
  (bar/line/pie), dataset edit reflow, dataset remove → placeholder, Cmd+Z
  revert — runtime proof the glyph's add action + the section's edits work. **2/2
  passing in Chromium.**

## Review-by

- `design-system-agent` — primitive promotion + glyph distinctness vs
  `IconLayoutGrid` / `IconImage` / `IconQr`

## Status

**Decided & implemented 2026-06-02.** Lands with WI-077 Phase 4.

**Addendum (Phase 5, 2026-06-02)** — the dataset table panel
(`DatasetEditorDialog`) shipped **composed from existing primitives** (`Dialog`,
`Button`, token-styled `<table>` + native `<input>`); a dedicated data-grid
primitive was **not** promoted (reuse value unconfirmed — Step 1 Reuse held).
No new design-system primitive beyond `IconChart`. e2e `chart-item.spec.ts`
panel test green in Chromium.

**Addendum 2 (2026-06-03, [DR-034](../decisions/DR-034-dataset-grid-react-data-grid.md))** —
the hand-rolled `<table>` was replaced by a **lazy react-data-grid** for
Excel-like input (block paste / drag-fill / keyboard nav), per a user request.
Design-system impact: **none new** — the grid is an app-local lazy module themed
via its `--rdg-*` CSS vars mapped to weave tokens (not promoted to
`@weave/design-system`; it's a single specialized surface, Step 1 Reuse / Step 4
Escape — keep app-local). `IconChart` + `ChartSection` unchanged. No new
design-system primitive.
