# WI-059 — fontSize px/ratio union (`fontSizeSpec`) adoption

- **Date:** 2026-05-30 · **Status:** Build done (gates green; e2e per note) · **Relates:** agocraft DR-030, weave DR-022
- **Trigger:** Aku/users couldn't express a size relative to the frame; a stray fraction in the px
  fontSize rendered as sub-pixel text (no guard). Consolidates weave's orphaned `fontSizeRatio`.

## Scope

Adopt agocraft v12 `TextAttrs.fontSizeSpec` (`{kind:"px"|"ratio",value}`; ratio = fraction of parent
frame height, root = design height) end-to-end in weave.

- **Vendor bump:** `@agocraft/core` → v12 (built with DR-030; later subsumed by the 070709 batch bump
  that also carries DR-028 decoration-units + QR). Symbols `resolveFontSize` / `fontSizeSpec` /
  `migrateFontSizeToSpec` confirmed in the vendored dist.
- **Render (B3):** `TextBlock` resolves `resolveFontSize(a.fontSizeSpec, a.fontSize, parentHeightPx)`.
  `parentHeightPx` is supplied by a new `ParentFrameHeightContext` provided around `<FrameContent>` in
  `FrameStage` (= the enclosing frame's design-px height; root passes `designHeight`). The design-plane
  `transform: scale` then maps design-px → screen-px as before. Per-run (rich-text) fontSize stays
  px-only in v1.
- **Add path consolidation:** `DesignPage.computeAddGeometry` now writes the responsive ratio as the
  canonical `fontSizeSpec {kind:"ratio"}` (resolved at render) instead of the orphaned, never-read
  `attrsOverride.fontSizeRatio`. `fontSize` stays as the px mirror. New text is now genuinely responsive.
- **PropertiesPanel (B5):** px/% `SegmentedControl` in the Size field (design-system triage = reuse of
  existing `SegmentedControl` + `NumberSlider`, no new primitive → no DR-design). px writes
  `fontSize`+`fontSizeSpec{px}`; % writes `fontSizeSpec{ratio, value: pct/100}`.
- **Agent (B4):** `weave-capabilities` text itemKind + `weave-command-schemas` TEXT_ATTRS_NOTE document
  both units and forbid putting a fraction in the bare `fontSize`.

## Verification

- agocraft: typecheck/test/build green (711 unit incl. 9 new).
- weave: `pnpm typecheck` GREEN; my 9 edited files `biome check` 0 errors. `verify:no-e2e` lint shows
  ~1844 errors that are **entirely from concurrent in-flight work** (DR-028 decoration-units / QR /
  themes) landed in the same submodule — not from this WI's files.
- e2e (`apps/web/e2e/text-item.spec.ts`): new `fontSizeSpec ratio renders…` test (ratio × design height
  + Cmd+Z); `default attrs` test updated (add-geometry yields a viewport-derived px + ratio spec, not
  the seed 24). Several canvas-interaction tests in that spec were **already failing pre-change**
  (verified by stashing this WI's edits: `Add menu … fontSize` returned 231 on baseline too) — stale
  expectations vs the pre-existing add-geometry, tracked separately.

## Follow-ups

- Stale-spec hazard: a raw `weave.item.update {fontSize}` (legacy-only) leaves a prior `fontSizeSpec`
  authoritative (reader prefers spec) — same coexistence caveat as `lineHeightSpec`. UI + agent paths
  write both; document/normalize if it bites.
