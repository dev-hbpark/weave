# WI-221 — Linked padding toggle (one value → all 4 sides)

## Metadata

| Field | Value |
|---|---|
| ID | WI-221 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Status | DONE |
| Type | Feature (layout UX) — WI-220 follow-up |
| Depends on | WI-220 (px-first gap/padding toolbar) |
| Design triage | Step 1 — Reuse (`Switch` + `NumberSlider`, no new primitive; extends DR-design-032) |

## Problem

WI-220 left padding as 4 independent per-side inputs (the common "same on all sides" case
needs 4 edits). Figma offers a linked single value with a toggle to per-side. WI-220 listed
this as the one out-of-scope follow-up.

## Change

`PaddingFields` (in `frame-background-section.tsx`) gains a "개별" (individual) `Switch`:

- **Linked** (default when all 4 sides already match) — one `All` `NumberSlider`; editing it
  sets all 4 sides in ONE `weave.frame.setLayout` (`setAllPaddingPx`: uniform `paddingPx`,
  per-axis ratio mirror left/right ÷ w, top/bottom ÷ h).
- **개별 ON** — the existing 4 per-side sliders (`setPaddingSidePx`, unchanged).
- Initial mode follows the data: `individual = !(all 4 px equal)`. Toggle is UI-local state.

Reuses the WI-220 px-first model (DR-139); no new core field, no engine change, no new
design-system primitive. The Switch is wrapped in a `<span>` (not `<label>`) because Radix
Switch is a button, not a native input — its own `aria-label="개별 여백"` carries the name.

## Verification

- e2e `gap-padding-toolbar.spec.ts` — `WI-221 linked padding`: fresh frame is linked, the
  `All` input sets all 4 sides to ~12; toggling 개별 ON then editing Left sets only Left (=30)
  while the others stay 12.
- weave unit 1373 green; tsc/biome clean; gap-padding-toolbar 3 green.
