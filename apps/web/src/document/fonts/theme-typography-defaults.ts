// WI-136 Phase 3 — per-theme default typography.
//
// Each theme can ship a deliberate type identity (display / body / mono font
// roles). These are DEFAULTS: a user override (useThemeTypography) wins, and a
// theme not listed here falls through to the base `--font-*` (Inter / JetBrains
// Mono). Referenced fonts are catalog google fonts, so they load on demand when
// their theme becomes active — never up front.
//
// Rule 6: a data registry keyed by theme name. Adding a theme identity = one
// entry. Values are catalog font ids (validated by the unit test).

import type { ThemeTypography } from "./use-theme-typography.js";

/** themeName → its default role→font-id map. Absent theme / role = base font. */
export const THEME_TYPOGRAPHY_DEFAULTS: Readonly<Record<string, ThemeTypography>> = {
  // Warm editorial light → classic serif pairing.
  paper: { display: "playfair-display", body: "lora" },
  // Bright comic pop → heavy Korean display + clean Korean body.
  webtoon: { display: "black-han-sans", body: "noto-sans-kr" },
  // Ink-comic high contrast → condensed display.
  noir: { display: "oswald", body: "noto-sans-kr" },
  // Warm dusk → rounded geometric display.
  sunset: { display: "poppins" },
  // Deep blue calm → modern geometric display.
  ocean: { display: "montserrat" },
};

/** The default typography for `theme` (empty when the theme ships none). */
export function themeTypographyDefault(theme: string): ThemeTypography {
  return THEME_TYPOGRAPHY_DEFAULTS[theme] ?? {};
}
