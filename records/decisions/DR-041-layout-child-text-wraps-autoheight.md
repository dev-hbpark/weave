# DR-041 — layout-child text wraps (auto-height), not auto-width; + role-based content

- **Date:** 2026-06-03 · **Status:** Accepted · **WI:** (defect fix + rule change, no WI)
- **Relates:** DR-040 (text auto-height — **corrects its prompt over-correction**), DR-039 (cell-fill), small-think **DR-023** (host-agnostic counterpart)

## Context

Agent-generated slides overflowed horizontally: a long text line spilled past its cell. Root
cause is **code-level**, not prompt: `deriveTextAutoResize` mapped *every* auto-flex/auto-grid
child to `WIDTH_AND_HEIGHT` (auto-width), and `TextBlock` renders auto-width as
`width: max-content` + `white-space: pre` — it never soft-wraps, so it hugs content and
overflows the cell. No prompt rule can fix this while the mode forces auto-width.

A second issue: DR-040's prompt wording told the agent to keep text *non-stretch* "to stay
auto-height" — but in a flex **column** the cross axis IS the width, so `stretch` is exactly
what bounds the text width and makes it wrap. The over-correction removed the one lever that
prevents horizontal overflow.

## Decision

1. **Code fix** — `deriveTextAutoResize`: an auto-flex/auto-grid child now returns **`HEIGHT`**
   (auto-height) instead of `WIDTH_AND_HEIGHT`. A laid-out child's WIDTH is owned by the parent
   layout (cross-axis stretch / grid column track / flex basis), so the text WRAPS to that width
   (`width: 100%` + `white-space: pre-wrap`) and auto-fits its HEIGHT. Auto-width remains only
   for free placement (an absolute-constraints `scale×scale` anchor — e.g. the UI "+ text" add),
   unchanged.
2. **Prompt reconciliation** — text guidance now says: BIND the text's WIDTH to its cell so it
   WRAPS (flex column → `align`/`alignSelf` `'stretch'` = the cross axis is the width; grid →
   the column track); only the HEIGHT is content-driven (no main-axis grow / vertical stretch /
   pinned height). Fixes DR-040's "prefer non-stretch for text" wording.
3. **Role-based content (new, forced)** — match each slide's content to its ROLE in the deck:
   an overview/agenda is a brief table of contents (just section names, ~no on-screen
   explanation); a section divider only names the part; the per-item DETAIL slide is the ONLY
   place that explains that item; a closing slide only closes. Never preview or dump a detail
   slide's explanation onto the overview — defer it to the slide whose role owns it.

## Scope (edits)

- `apps/web/src/document/domains/derive-text-auto-resize.ts` — auto-flex/auto-grid → `HEIGHT`
  (the fix) + comment. **New** `derive-text-auto-resize.test.ts` locks all branches (7 tests).
- `weave-capabilities.ts` — text PLACEMENT bullet + `WEAVE_DOMAIN_KNOWLEDGE` rule 3: width-bind
  /wrap reconciliation; `WEAVE_TASK_PRIMER`: text-wrap bullet reworded + new "match content to
  the slide's role" bullet.
- `weave-command-schemas.ts` — `LAYOUT_SPEC` / `LAYOUT_CHILD_POLICY` `stretch` caveats corrected
  (cross-stretch bounds a TEXT child's width so it wraps; grid column track bounds it).

## Verification

biome clean; `apps/web` recursive typecheck green; 494 document/aku unit tests + the new 7
derive tests pass. The change only affects the auto-flex/auto-grid branch — the `text-item`
e2e (absolute anchors) and `layout-*` e2e (shape children) are unaffected. Browser visual
check not run; the new unit test covers the derive contract.

## Consequences

- Layout-child text wraps to its cell and auto-fits height — horizontal overflow gone.
- A layout child can no longer be auto-width (intended: auto-width in a cell = overflow);
  auto-width stays available for free placement.
- Corrects DR-040 (DR-040 gets a "Refined by DR-041" pointer).
