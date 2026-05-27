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

## Results

| Surface | Critical | Serious | Moderate | Minor | Verdict |
|---|---|---|---|---|---|
| Landing page | 0 | **1** | tbd | tbd | **FAIL** — 1 serious violation |
| Design page (frame + text) | 0 | **1** | tbd | tbd | **FAIL** — 1 serious violation |
| Design page (empty) | 0 | 0 | tbd | tbd | **PASS** |

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

## Decision matrix

Per the audit's severity policy (a11y-smoke.spec.ts header):

| Severity | Launch policy |
|---|---|
| `critical` / `serious` | **Launch blocker.** Fix or accept via design-system-triage with written waiver. |
| `moderate` | Follow-up PR before T-0 + 1 week. Listed in LG "post-launch open items". |
| `minor` | Backlog. Not launch-blocking. |

**Both findings are `serious`.** They are launch blockers under this policy unless explicitly waived by design-system-triage. Two possible paths to LG-001 + LG-002 close:

- **Path A — Fix before T-0 (2026-06-08)**: Touch the `--text-soft` token (or the eyebrow-specific override) and refactor the nested-interactive wrapper. Estimated effort: 0.5 day if the nested-interactive culprit is a single component, 1-2 days if it's pattern-wide.
- **Path B — Ship with documented waiver**: design-system-triage records the two known violations + remediation plan + disclosure in the launch-note. LG-001 / LG-002 sign-off list moves from `Conditional` → `Conditional with documented exceptions`.

Path A is preferred. Path B is acceptable for a 2-week-out launch.

## Spec state

`apps/web/e2e/a11y-smoke.spec.ts` is checked in with the three tests **active and failing** for the known violations. CI will go red on these — that is intentional, the failures are tracked in this audit log and the next PR will either fix them (Path A) or waive them (Path B) by gating the failing tests with a `test.skip` referencing this audit.

## Links

- LG-001: `records/launch-gates/LG-001-text-item-v1.md` (blocker row will be ticked + cross-link this audit)
- LG-002: `records/launch-gates/LG-002-figma-frame-ux.md` (same)
- Spec: `apps/web/e2e/a11y-smoke.spec.ts`
- Tool: `@axe-core/playwright` v4.11.3 (devDependency added 2026-05-28)
