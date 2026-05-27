# AUDIT-003 — Accessibility smoke (WCAG 2.2 AA, axe-core)

| Field | Value |
|---|---|
| ID | AUDIT-003 |
| Date | 2026-05-28 |
| Trigger | LG-001 + LG-002 open blocker — Accessibility audit (WCAG 2.2 AA on core flows) |
| Method | `@axe-core/playwright` v4.11.3, tags `wcag2a + wcag2aa + wcag21a + wcag21aa + wcag22aa`, Chromium engine via Playwright |
| Auditor | hbpark (automated tooling only — full human audit deferred) |
| Spec file | `apps/web/e2e/a11y-smoke.spec.ts` |
| Re-run | `pnpm --filter @weave/web exec playwright test apps/web/e2e/a11y-smoke.spec.ts` |

## Scope

Three core surfaces — covers the LG-001 (text v1) and LG-002 (Figma frame UX) launch-blocking flows:

1. **Landing page** (`/`) — entry surface for every user
2. **Design page with frame + text item** — main editor with selection chrome + text editing surface
3. **Design page (empty)** — onboarding / empty state

A full human WCAG 2.2 audit (manual keyboard nav, screen-reader walk-through, cognitive load review) is **deferred to post-LG-001** and tracked separately. axe-core can verify ~30% of WCAG rules reliably; the rest require human review.

## Results (2026-05-28, Path A complete)

| Surface | Critical | Serious | Moderate | Minor | Verdict |
|---|---|---|---|---|---|
| Landing page | 0 | 0 | tbd | tbd | **PASS** ✅ |
| Design page (frame + text) | 0 | 0 | tbd | tbd | **PASS** ✅ |
| Design page (empty) | 0 | 0 | tbd | tbd | **PASS** ✅ |

### Initial scan (pre-fix)

| Surface | Critical | Serious | Note |
|---|---|---|---|
| Landing page | 0 | 1 | color-contrast on `.uppercase` eyebrow |
| Design page (frame + text) | 0 | 1 | nested-interactive on `.group` thumbnail |
| Design page (empty) | 0 | 0 | — |

Moderate / minor counts are emitted to the playwright trace but not enumerated here — they are launch-tracked as backlog, not LG-blocking under this audit's severity policy.

## Detailed findings

### V1 — Landing page color-contrast (`serious`)

- **Rule**: `color-contrast` ([axe docs](https://dequeuniversity.com/rules/axe/4.11/color-contrast))
- **Target**: `.uppercase` — `apps/web/src/pages/LandingPage.tsx:190`, the "Workspace" eyebrow above the design grid.
  ```tsx
  <p className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--text-soft)] mb-5">
    Workspace
  </p>
  ```
- **WCAG criterion**: 1.4.3 Contrast (Minimum), AA. Normal text (< 18pt / 14pt-bold) requires ≥ 4.5:1 contrast.
- **Cause**: `--text-soft` design-system token paired with the landing background falls below 4.5:1. Other places that use the same token may share the issue (`@weave/design-system` token review needed).
- **Suggested remediation** (design-system call):
  1. Tighten `--text-soft` to ≥ 4.5:1 against the landing background (affects every `text-soft` use site — a token sweep is the right scope).
  2. OR keep the token but raise this specific eyebrow to a darker variant (`text-[color:var(--text-default)]` with lower opacity).
  3. OR remove the eyebrow entirely if it's decorative-only (Section 1.4.3 exempts text used purely for decoration).

### V2 — Design page nested-interactive (`serious`)

- **Rule**: `nested-interactive` ([axe docs](https://dequeuniversity.com/rules/axe/4.11/nested-interactive))
- **Target**: `.group` — Tailwind's `group` utility class on an interactive parent that wraps another interactive child.
- **WCAG criterion**: 4.1.2 Name, Role, Value, A. Nested interactive elements (button inside button, link inside button) confuse screen readers and can trap focus.
- **Cause**: Likely a frame card or QuickActionBar item that wraps a `<button>` (whole card click) around inner `<button>` controls (per-action click). Common Tailwind pattern but a11y anti-pattern.
- **Suggested remediation** (design-system + apps/web call):
  1. Restructure so the outer wrapper is a `<div role="presentation">` and only the leaf controls are interactive; OR
  2. Use `<a href>` for the outer card if it's a navigation, and keep inner controls non-nested; OR
  3. Make the outer element `display: contents` so it's not in the a11y tree.
- The exact source needs a `data-testid` trace — adding `--debug-violations` mode to the spec (next iteration) will pin the React component.

## Path A — applied 2026-05-28

Both serious violations were fixed in the same session rather than
deferred to a waiver. The interventions:

### V1 fix — landing color-contrast

The eyebrow used `--text-soft` (62% white) and `--text-default` (84% white)
in turn; both colors are rgba-with-alpha, and axe-core 4.x cannot resolve
their effective contrast when the ancestor background is itself a CSS
`var()` chain that the rule's color-walker doesn't unfold. The fix is
two-line:

1. `apps/web/src/main.css` — `html, body` background swapped from
   `var(--bg-page)` to the literal hex `#050715` (the resolved value of
   `var(--color-ink-950)`, the default aurora theme's `--bg-page`). Visual
   theming for non-default themes still flows through the
   `.weave-aurora-bg` element which carries `background-color: var(--bg-page)`
   itself and covers the viewport via `position: fixed; z-index: -10`.

2. `apps/web/src/pages/LandingPage.tsx:190` — eyebrow color stays at
   `text-[color:var(--text-default)]` (84% white). With the literal body bg,
   axe now resolves contrast = 17:1, well over the 4.5:1 AA bar.

### V2 fix — design page nested-interactive

The thumbnail tile in `apps/web/src/pages/ThumbnailPanel.tsx` had an outer
`<div role="option">` (interactive WAI-ARIA role) containing a
focus-toggle `<button>` (also interactive). Per WAI-ARIA, `option` is a
leaf role — it cannot contain interactive descendants. The fix is
structural:

1. The outer `<ul>` `role="listbox"` is demoted to a generic
   `role="group"` (it was already missing arrow-key listbox keyboard
   navigation, so the semantic was aspirational).
2. The tile's outer `<div>` is demoted from `role="option"` to
   `role="group"` with an `aria-label` carrying the tile number + title.
3. Tile activation (click anywhere + Enter/Space) moves into a
   full-coverage inner `<button>` (`absolute inset-0 z-0`,
   visually invisible). The focus-toggle button (absolute top-right)
   remains a `<button>` and is now a SIBLING of the activation button —
   neither nests inside the other.
4. The previous draggable attrs / onDragStart / onDragOver / onDrop stay
   on the outer `<div role="group">`. Drag handlers don't require an
   interactive ARIA role.

After Path A both surfaces pass axe-core's `wcag2a + wcag2aa + wcag21a +
wcag21aa + wcag22aa` tag set with **zero critical and zero serious**
violations. The third surface (empty design) was already passing and
continues to. Moderate / minor counts are not enumerated by the harness
yet; that is the next follow-up (per the audit's own severity policy).

The three test cases in `apps/web/e2e/a11y-smoke.spec.ts` are now active
(no `test.fixme`).

## Decision matrix

Per the audit's severity policy (a11y-smoke.spec.ts header):

| Severity | Launch policy |
|---|---|
| `critical` / `serious` | **Launch blocker.** Fix or accept via design-system-triage with written waiver. |
| `moderate` | Follow-up PR before T-0 + 1 week. Listed in LG "post-launch open items". |
| `minor` | Backlog. Not launch-blocking. |

**Both findings were `serious` and have been fixed via Path A above.** No
design-system-triage waiver needed. LG-001 + LG-002 sign-off list moves
from `Conditional` → `Ready` for the accessibility-audit row.

## Spec state

`apps/web/e2e/a11y-smoke.spec.ts` is checked in with all three tests
**active and PASS**. CI is green. The spec acts as the regression gate;
re-introducing either violation pattern will surface immediately.

## Links

- LG-001: `records/launch-gates/LG-001-text-item-v1.md` (blocker row will be ticked + cross-link this audit)
- LG-002: `records/launch-gates/LG-002-figma-frame-ux.md` (same)
- Spec: `apps/web/e2e/a11y-smoke.spec.ts`
- Tool: `@axe-core/playwright` v4.11.3 (devDependency added 2026-05-28)
