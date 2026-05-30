/*
 * themes.ts — single source of truth for the theme registry.
 *
 * Before WI: the theme list was duplicated in three places — the `ThemeName`
 * union (use-theme.ts), the `readStored` validation chain, and the `THEMES`
 * array (ThemeSwitcher.tsx). Each new theme meant editing three N-way `||`
 * chains by hand — an Open-Closed violation (OS Rule 6: declarative branching).
 *
 * This module is the registry. `ThemeName` is *derived* from `THEMES`, and
 * membership is a single `Set` lookup (`isThemeName`). Adding a theme = one
 * entry here + one `[data-theme="…"]` block in tokens.css. Nothing else.
 *
 * Registry governance: the theme set is gated by features/design-system/RULE.md
 * rule #5 (Design Review + seo-ai-visibility-agent sign-off). See
 * records/design-reviews/DR-design-026-theme-expansion.md for the current set.
 */

export interface ThemeMeta {
  /** Maps 1:1 to a `[data-theme="<name>"]` block in tokens.css. */
  readonly name: string;
  /** Human label shown in the theme picker. */
  readonly label: string;
  /** One-line identity hint (tooltip). */
  readonly hint: string;
  /** Perceived luminance group — drives the picker's Dark / Light sections. */
  readonly tone: "dark" | "light";
}

export const THEMES = [
  { name: "aurora", label: "Aurora", hint: "premium dark glass + gradient", tone: "dark" },
  { name: "vivid", label: "Vivid", hint: "max playful dark", tone: "dark" },
  { name: "mono", label: "Mono", hint: "Linear-grade sharp monochrome", tone: "dark" },
  { name: "noir", label: "Noir", hint: "ink-comic high contrast", tone: "dark" },
  { name: "forest", label: "Forest", hint: "calm emerald dark", tone: "dark" },
  { name: "sunset", label: "Sunset", hint: "warm dusk gradient", tone: "dark" },
  { name: "ocean", label: "Ocean", hint: "deep blue calm", tone: "dark" },
  { name: "daylight", label: "Daylight", hint: "clean light, sky accent", tone: "light" },
  { name: "paper", label: "Paper", hint: "warm editorial light", tone: "light" },
  { name: "webtoon", label: "Webtoon", hint: "bright comic pop", tone: "light" },
] as const satisfies readonly ThemeMeta[];

/** Distinct tone groups in registry order — drives the picker's sections. */
export const THEME_TONES = ["dark", "light"] as const;

/** Union of every registered theme name, derived from `THEMES`. */
export type ThemeName = (typeof THEMES)[number]["name"];

export const DEFAULT_THEME: ThemeName = "aurora";

const THEME_NAMES: ReadonlySet<string> = new Set(THEMES.map((t) => t.name));

/** Runtime + type guard: is `value` a registered theme name? */
export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEME_NAMES.has(value);
}
