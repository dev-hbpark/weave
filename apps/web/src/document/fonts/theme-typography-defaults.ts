// WI-136 Phase 3 — per-theme default typography (completed for all themes: DR-090).
//
// Each theme ships a deliberate type identity (display / body / mono font roles).
// These are DEFAULTS: a user override (useThemeTypography) wins, and a role left
// unset falls through to the base `--font-*` (Inter / JetBrains Mono) — symmetric
// with how a theme's color defaults leave unset slots on the base palette.
// Referenced fonts are catalog google fonts, so they load on demand when their
// theme becomes active — never up front.
//
// Rule 6: a data registry keyed by theme name. Adding a theme identity = one
// entry. Values are catalog font ids (validated by the unit test, which also
// asserts EVERY registered `THEMES` name has a non-empty entry here).
//
// Entries follow the `@weave/design-system` THEMES registry order (dark → light)
// so "every theme has an identity" is auditable at a glance.

import type { ThemeTypography } from "./use-theme-typography.js";

/** themeName → its default role→font-id map. An unset role = base font. */
export const THEME_TYPOGRAPHY_DEFAULTS: Readonly<Record<string, ThemeTypography>> = {
  // ── Dark ────────────────────────────────────────────────────────────────
  // Premium dark glass + gradient → modern, refined geometric display (DR-090).
  aurora: { display: "manrope" },
  // Max playful dark → loud heavy display + friendly rounded body (DR-090).
  vivid: { display: "archivo-black", body: "nunito" },
  // Linear-grade sharp monochrome → sharp geometric display + technical mono;
  // body stays Inter (Linear's own typeface) (DR-090).
  mono: { display: "dm-sans", mono: "ibm-plex-mono" },
  // Ink-comic high contrast → condensed display.
  noir: { display: "oswald", body: "noto-sans-kr" },
  // Calm emerald dark → calm editorial serif display + humanist body (DR-090).
  forest: { display: "source-serif-4", body: "work-sans" },
  // Warm dusk → rounded geometric display.
  sunset: { display: "poppins" },
  // Deep blue calm → modern geometric display.
  ocean: { display: "montserrat" },
  // ── Light ───────────────────────────────────────────────────────────────
  // Clean light, sky accent → airy, elegant display (DR-090).
  daylight: { display: "raleway" },
  // Warm editorial light → classic serif pairing.
  paper: { display: "playfair-display", body: "lora" },
  // Bright comic pop → heavy Korean display + clean Korean body.
  webtoon: { display: "black-han-sans", body: "noto-sans-kr" },
};

/** The default typography for `theme` (empty when the theme ships none). */
export function themeTypographyDefault(theme: string): ThemeTypography {
  return THEME_TYPOGRAPHY_DEFAULTS[theme] ?? {};
}
