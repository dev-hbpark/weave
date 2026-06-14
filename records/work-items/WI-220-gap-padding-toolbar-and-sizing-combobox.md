# WI-220 — Gap/padding numeric toolbar + sizing combobox

## Metadata

| Field | Value |
|---|---|
| ID | WI-220 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | IN PROGRESS |
| Type | Feature (layout UX / a11y) |
| Depends on | WI-219 (canvas gap/padding handles), WI-042 (sizing), DR-design-031 |
| Decision records | [DR-design-032](../design-reviews/DR-design-032-gap-padding-toolbar.md) |

## Problem

WI-219 added on-canvas drag handles for padding + grid gap, but flagged (DR-design-031)
that there is **no keyboard-accessible / numeric** way to author them — drag was the only
path. Pointer-only authoring fails keyboard users and makes a precise value (e.g. exactly
24px) fiddly. Separately, the container width/height sizing control (Fixed / Hug / Fill,
WI-042) is a `SegmentedControl`; the user wants it as a **combobox** (compact trigger,
consistent with the per-child Grow/Align selects).

## Scope

1. **Sizing → combobox** — `frame-sizing-section.tsx`: swap `SegmentedControl` →
   `Select` for both axes (width/height). Same option data + apply logic; the Select API
   mirrors SegmentedControl (DR-design-021), so it is a drop-in.
2. **Gap/padding numeric inputs → px-first.** DISCOVERY: the numeric inputs already
   existed in the frame **kind** section's layout More (`frame-background-section.tsx`) —
   but authored **ratio %** (and left a stale `gapPx`, so the WI-043 engine would IGNORE a
   % edit on the next resize). So this is NOT a new section — it **upgrades the existing
   controls to px-first** (decommission-sweep: fix the home, don't duplicate):
   - flex `간격`; grid `열 간격` / `행 간격`; 4-side `여백` (per side) — all DESIGN PX.
   - Each authors the px field (`gapPx` / `columnGapPx` / `rowGapPx` / `paddingPx[side]`) +
     ratio mirror (`px ÷ frame abs px`, per-frame in multi-select via `absoluteFrameBox` +
     `useDesignDims`), dispatched with `designWidth/Height` so the engine reflows at fixed
     px (WI-043 P6). A throwaway `frame-spacing-section.tsx` was prototyped then removed
     once the existing home was found (it would have been a second, conflicting gap/padding
     surface + a duplicate `toolbar-more-trigger`).

Out of scope (follow-up): linked "set all sides" padding toggle.

## Plan (SOLID/GRASP)

- New section = its own file (SRP): sizing-section owns sizing, spacing-section owns
  gap/padding. Both gated to a single flex/grid frame, rendered by ContextualToolbar.
- px↔ratio mirror reuses the WI-219 model (DR-139): px-first, ratio = px ÷ frame abs px
  (via `absoluteFrameBox` + `useDesignDims`). No new core field; no engine change.
- Reuse `Select` + `NumberSlider` (no new design-system primitive → triage Step 1 Reuse).
- All mutation via `weave.frame.setLayout` (Document mutation rule); NumberSlider commit
  is one undo step.

## Verification

- e2e `gap-padding-toolbar.spec.ts`: (1) sizing combobox sets width to Hug; (2) typing a
  gap value authors `gapPx`; (3) typing a padding value authors `paddingPx`.
- Regression: weave unit suite + layout e2e set; existing frame-sizing e2e (hug-resize).

## Status log

**Build DONE (2026-06-14):**
- `frame-sizing-section.tsx`: `SegmentedControl` → `Select` (combobox) for width/height,
  `data-testid` `frame-sizing-{width,height}` (options → `frame-sizing-{axis}-option-{value}`).
- `frame-background-section.tsx`: upgraded the existing layout-More gap/padding sliders
  from ratio % → **px-first** (`flexGapPxDisplay` / grid col·row / per-side `paddingPxOf`;
  writers `setFlexGapPx` / `setGridGapPx` / `setPaddingSidePx` compute px→ratio per frame
  via `boxOf` + thread `designWidth/Height`). Removed the now-dead ratio `onPaddingSideChange`.
  Section now takes `document` + `useDesignDims`.
- Prototyped then REMOVED `frame-spacing-section.tsx` (would have been a 2nd gap/padding
  surface + duplicate `toolbar-more-trigger` — the e2e strict-mode collision is what
  surfaced that the controls already lived in the frame kind More).
- Migrated the 4 `hug-resize.spec.ts` sizing interactions segment-click → combobox
  open→option-click. Fixed a WI-219 leak: `handle-gesture-runner.test.ts`'s exact kind-set
  assertion now includes `layout-padding-drag` / `layout-gap-grip-drag` (slipped through
  because WI-219 re-ran only e2e, not the unit suite).
- weave unit 1373 green, tsc/biome clean. Live e2e `gap-padding-toolbar.spec.ts` (3:
  combobox→Hug, 간격 input→gapPx≈24, Padding left input→paddingPx.left≈16) + hug-resize 9
  + contextual-toolbar-redesign 5.
