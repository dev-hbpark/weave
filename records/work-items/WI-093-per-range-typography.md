# WI-093 — Per-range typography (generalize the editor style bridge)

| Field | Value |
|---|---|
| Status | In Progress (single-session, 2026-06-05) |
| Owner | hbpark |
| Parent | WI-029 (text item Phase 2 follow-up) |
| FR | FR-019 = FEASIBLE WITH TRADE-OFFS |
| Decision | DR-062 (extends DR-060) |
| Plan | `features/text/ENGINEERING_PLAN_WI093.md` |

## Problem (operator report, 2026-06-05)

Editing a text item and selecting a sub-range (부분/range):

1. Most style controls don't apply to the range — only the outline does. Many
   properties "적용이 안 된다" or change the whole box.
2. The 외곽선 두께 slider: in per-range mode, mouse-down makes the More popover
   (메뉴) disappear — unlike whole-item mode where it works.
3. The control's displayed color should be multi-color when the whole selection
   spans several colors, and a single color when the sub-range is uniform.

## Scope

- IN: per-range color, font size (px), font family, decoration (꾸밈), case
  (대소문자), letter-spacing (자간); reuse existing per-range B/I/U + outline;
  selection-aware display (mixed vs single); keep More popover open during a
  per-range slider drag.
- OUT: per-range font-size as % (ratio); collaborative sync; non-text kinds.

## Acceptance

- Selecting a sub-range and changing any in-scope property changes ONLY that
  range; it round-trips through `textRuns` on edit exit and is undoable.
- Dragging the 외곽선 두께 slider (and using the ColorPicker) while editing does
  not close the More popover.
- The color swatch reflects the selection: mixed for multi-color, single for a
  uniform sub-range.
- Suite green incl. a real-UI e2e exercising the popover + slider path.

See DR-062 for the design and FR-019 for the feasibility verdict.

## Verification (2026-06-05, SVL gate)

- **Typecheck:** `@weave/web` + `@weave/design-system` clean.
- **Lint:** clean on all changed files (only pre-existing array-index-key
  warnings in `renderReadOnly`, untouched).
- **Unit:** 576 passed, incl. new `range-style-registry.test.ts` (toCss/fromCss
  round-trip, single source) and the extended `LexicalTextEditor.test.ts`
  (readSnapshot extracts color/size/family/spacing/case).
- **e2e (real UI, new `text-per-range-typography.spec.ts`):**
  - per-range outline applies to ONLY the selected range AND the 더보기 popover
    stays open across the editor-focus bounce (② fixed). ✅
  - 글자색 swatch shows the single color for a uniform sub-range and the mixed
    swatch (#cccccc) across differing colors (③ fixed). ✅
- **Decommission:** removed `active-text-outline.ts` and the bridge-only
  `text-outline-per-range.spec.ts`; migrated coverage to the real-UI spec.

### Follow-up (2026-06-05) — caret-position pending style

The first cut preserved only the last NON-collapsed range, so after the user
collapsed the range to a caret (still editing) the OLD range stayed the apply
target. Fixed in `TextStylePlugin`: capture the last selection made **while the
editor has focus** (range OR caret), ignoring the blur-collapse from the toolbar
mousedown. On apply, restore it — a range styles that range; a **caret** sets
`$patchStyleText`'s pending style so the NEXT typed text carries the property.
New e2e `collapsing the range applies the next property at the caret (pending
style)` asserts the old range stays red and a freshly-typed char carries the
caret's pending blue. ✅

### Follow-up (2026-06-05) — slider drag "doesn't move / menu turns off"

Three layered causes behind the 외곽선 두께 slider drag misbehaving in per-range
mode, all in `TextStylePlugin`:

1. **Focus theft mid-drag.** Each per-range apply ran a normal `editor.update`
   that reconciled the DOM selection → FOCUSED the contentEditable → stole focus
   from the slider thumb (drag died, value stuck) and bounced focus out of the
   popover. Fix: **continuous** (slider) applies carry Lexical's
   `skip-dom-selection` update tag so the DOM selection/focus is not reconciled;
   discrete applies (color/family/case) reconcile normally (focus returns →
   caret-then-type + multi-run selection stay coherent). `setStyleProp` gained an
   `{ continuous }` option; the size / 자간 / outline-width sliders pass it.
2. **Over-eager selection restore.** `withSelection` re-set the selection on
   every apply, which collapsed an already-correct in-editor selection (observed
   a 3-char range dropping to 1) and broke a subsequent keyboard extend. Fix:
   restore the saved selection ONLY when the editor is blurred (toolbar
   interaction); when focused, use the live selection untouched.
3. **Stale readout race (swatch/value lag).** The readout was read inside a
   `SELECTION_CHANGE_COMMAND` dispatch via `editor.getEditorState()` (the
   COMMITTED state), which non-deterministically lagged the pending selection —
   a multi-color range sometimes displayed as a single color and the slider
   value stuck. Fix: push the readout from `registerUpdateListener`, which
   delivers the NEW committed `editorState`.

New e2e: `the 외곽선 두께 slider value tracks the apply and the popover stays
open` (value follows + popover survives), and the color-display test was made
deterministic by seeding mixed runs via the model. Full per-range suite (4
tests) green across repeated runs; `text-item` + `history-text` (24) green.

### Pre-existing failures (NOT WI-093 — out of scope)

- `contextual-toolbar-redesign.spec.ts` :127 / :156 — stale DR-021-era spec:
  asserts English `aria-label="Family"` (code is Korean "글꼴" since
  DR-design-016) and the old `AlignmentPad` cell testid `-1-2` (component now
  emits value-based `-center-BOTTOM`). Neither file is in this change set.
- `text-item.spec.ts:395` (Enter newline) — flaky in batch, passes in isolation.
- `pnpm declarativecheck` — 3 Rule-6 hits in pre-existing files
  (`derive-text-auto-resize.ts`, `use-weave-editor.ts`, `PresentPage.tsx`),
  none introduced here; the WI-093 registry is iteration-based (no `switch`).
