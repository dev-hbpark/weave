# @weave/design-system

> WI-002 / DR-007. Shared design system for every weave app and adjacent package. **Single source of truth for visual identity.**
>
> Companion docs: `features/design-system/README.md` (project-anchored deep-dive).

## Why this package exists

The same tokens, theme variants, motion contract, and primitive components must drive every weave surface — `apps/web` today, future landing SSG / docs / admin / agocraft hosting / embed-only modes tomorrow. Living inside one app was a footgun; this package gives all consumers one import path and one upgrade story.

## Public surface

```ts
import {
  // bg
  AuroraBg,
  // primitives
  Button,
  Card,
  CardEyebrow,
  CardTitle,
  ThemePicker,
  // utility
  cn,
  // theme
  useTheme,
  type ThemeName,
} from "@weave/design-system";
```

CSS bundle (one import gets everything):

```css
@import "@weave/design-system/styles.css";
```

or piecemeal:

```css
@import "@weave/design-system/tokens.css";
@import "@weave/design-system/aurora-bg.css";
```

## Design constraints encoded here

- **3-layer token system** — base / semantic / component. Add layers only when measured pain.
- **10 theme variants** (DR-design-026) — registry SSOT in `src/themes.ts`. Dark: Aurora (default) / Vivid / Mono / Noir / Forest / Sunset / Ocean. Light: Daylight / Paper / Webtoon. Switched via `[data-theme="…"]` on `<html>`.
- **Motion contract** — all motion respects `prefers-reduced-motion`. Uses `motion` lib's spring defaults via `useReducedMotion`.
- **a11y** — Radix primitive 위에 token 입힘. WCAG AA contrast 의무. focus-visible ring 박제.
- **Tree-shaking** — `"sideEffects": ["**/*.css"]` (JS는 free for tree-shake, CSS는 import side-effect 보존).
- **No reflect-metadata / decorators** — feedback-tree-shaking 룰 동행.
- **Named const exports** — no default export, no catalog object.

## Adding a new component

1. Drop `src/components/<Name>.tsx`.
2. Re-export from `src/components/index.ts`.
3. Document tokens it consumes (which `--color-*` / `--surface-*` / `--motion-*` it reads).
4. Verify `prefers-reduced-motion`, focus-visible, keyboard nav.

## Adding a new theme variant

The theme list is a single registry — `src/themes.ts`. `ThemeName` is *derived*
from it and membership is one `isThemeName()` lookup, so the switcher + storage
guard update themselves. Two edits per theme:

1. Add one entry to the `THEMES` array in `src/themes.ts` (`{ name, label, hint }`).
2. Add the matching `[data-theme="<name>"]` block in `src/tokens.css`, overriding
   the same semantic set as the `aurora` block (page / aurora-stops / surface /
   text / accent / border / focus / shadow / domain-accents / focus-stages). You
   do **not** redeclare `--hover-affordance-*` / `--arrange-preview-*` — they hold
   `var(--accent)` / fixed cyan and re-resolve per theme at use-time.
3. Verify color contrast against every text/bg pair (axe-core or manual). For a
   LIGHT theme, flip text/surface to a dark-ink ramp and keep accent-as-button-bg
   at ≥ 3:1 (AA-large) with white `--text-on-accent`.

Governance: the registry is gated — see `features/design-system/RULE.md` #5
(Design Review + `seo-ai-visibility-agent` sign-off). Current set: DR-design-026.

## Why source-direct (no build step)

dev cycle 우선. `pnpm-workspace.yaml` 의 link 가 Vite 의 dep-optimize 와 자연. 미래 (publish 시) tsup build 추가 — DR-007 § "Consequences" 박제.
