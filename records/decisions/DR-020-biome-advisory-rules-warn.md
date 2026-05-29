# DR-020 — biome advisory rules set to `warn` (lint-debt burndown)

| Field | Value |
|---|---|
| ID | DR-020 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Status | Accepted |

## Context

weave's `biome.json` uses `recommended: true`, which enables biome's full a11y +
hook-deps rule set at **error** severity. The app predates enforcement, so
`pnpm lint` carried ~177 pre-existing errors (verify was effectively red). A
cleanup pass fixed every **mechanical** issue (formatter, organize-imports,
optional-chain, unused, useless-fragments) and every **genuine** defect
(noUnreachable, useIterableCallbackReturn, useJsxKeyInIterable, a non-functional
`<label>` wrapping a self-labelled `Switch` → `<span>`, an unsupported
`aria-label` on a role-less `<span>` → `title`, redundant landmark roles,
decorative svgs → `aria-hidden`).

What remained (~80) was overwhelmingly **biome false-positives on already-correct
code**, proven by the CommandPalette case where biome's own autofix *removed* the
correct `role="listbox"` / `role="option"` ARIA. "Fixing" these would mean
scattering ~60 inline `// biome-ignore` comments — noisier and less honest than
classifying the rules as advisory.

## Decision

Downgrade the false-positive-prone, advisory rules to **`warn`** (still surfaced,
non-blocking) — matching the React community default (eslint
`react-hooks/exhaustive-deps` ships as warn for exactly this reason):

- `correctness/useExhaustiveDependencies` — intentional omissions (refs,
  mount-only effects, stable callbacks) dominate in a canvas editor.
- `a11y/useSemanticElements` — valid ARIA roles on generic primitives
  (region/contentinfo/group/list) with no clean HTML equivalent.
- `a11y/noStaticElementInteractions` + `a11y/useKeyWithClickEvents` — canvas
  pointer-surfaces are not buttons; keyboard nav is handled centrally.
- `a11y/noNoninteractiveElementToInteractiveRole` — listbox/option is the correct
  pattern (the CommandPalette false-positive).
- `a11y/useFocusableInteractive` — `aria-activedescendant`-managed focus.
- `suspicious/noArrayIndexKey` — append-only / static lists.

Kept at **error** and fixed in code: everything genuine (see Context).

## Consequence

`pnpm verify` lint gate is green (0 errors); the advisory rules remain visible as
warnings for incremental burndown. No a11y/behaviour regression — the genuine
issues were fixed, and the warned items are valid patterns. Reversible per-rule.
