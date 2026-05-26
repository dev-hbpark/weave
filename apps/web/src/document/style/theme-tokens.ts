// WI-040 — Theme token registry.
//
// Maps weave's design-system CSS custom properties onto agocraft StyleProvider
// token names. The mapping lives in two parallel registries:
//
//   • THEME_COLOR_TOKENS — ordered list shown in the ColorPicker theme row
//     (label + tokenName + varName). The order is the display order.
//   • VAR_TO_TOKEN / TOKEN_TO_VAR — fast lookup tables derived from the list,
//     used at command-dispatch / resolution time.
//
// Token names follow agocraft's dotted convention (`color.accent`,
// `color.domain.slide`). The token's stored *value* in the document's
// style.provider Unit is the CSS `var(--*)` string. CSS's own variable
// resolution then provides the theme awareness — when `[data-theme]`
// flips, every consumer reading the token gets the new theme's value
// without document mutation.
//
// Translucent surface tokens (`--surface-1`, `--accent-soft`) are included
// for completeness; using them as a frame background lets the page bg show
// through. The picker shows a checker overlay for low-alpha values so the
// trade-off is visible to the user.

import { ref, type StyleRef } from "@agocraft/core";

export interface ThemeColorToken {
  /** Display label shown in the ColorPicker theme swatch row. */
  readonly label: string;
  /** Agocraft token name — written into the document's style.provider
   *  Unit `tokens` map and used as the `$ref` in StyleRef.
   *  Follow dotted-namespace convention. */
  readonly tokenName: string;
  /** CSS custom property name (including leading `--`). The value stored
   *  under the tokenName is `var(<varName>)` so CSS resolves it per
   *  active `[data-theme]`. */
  readonly varName: string;
  /** Optional group hint — drives section breaks in the picker. */
  readonly group: "accent" | "domain" | "text" | "surface" | "bg";
}

export const THEME_COLOR_TOKENS: ReadonlyArray<ThemeColorToken> = [
  // Accent — the theme's primary actionable color.
  { label: "Accent", tokenName: "color.accent", varName: "--accent", group: "accent" },
  {
    label: "Accent Strong",
    tokenName: "color.accent.strong",
    varName: "--accent-strong",
    group: "accent",
  },
  {
    label: "Accent Soft",
    tokenName: "color.accent.soft",
    varName: "--accent-soft",
    group: "accent",
  },
  // Domain accents — per-kind identity (slide / canvas / block / media).
  {
    label: "Slide",
    tokenName: "color.domain.slide",
    varName: "--domain-slide-accent",
    group: "domain",
  },
  {
    label: "Canvas",
    tokenName: "color.domain.canvas",
    varName: "--domain-canvas-accent",
    group: "domain",
  },
  {
    label: "Block",
    tokenName: "color.domain.block",
    varName: "--domain-block-accent",
    group: "domain",
  },
  {
    label: "Media",
    tokenName: "color.domain.media",
    varName: "--domain-media-accent",
    group: "domain",
  },
  // Text — readable ink ramp.
  {
    label: "Text Strong",
    tokenName: "color.text.strong",
    varName: "--text-strong",
    group: "text",
  },
  {
    label: "Text",
    tokenName: "color.text.default",
    varName: "--text-default",
    group: "text",
  },
  {
    label: "Text Soft",
    tokenName: "color.text.soft",
    varName: "--text-soft",
    group: "text",
  },
  {
    label: "Text Muted",
    tokenName: "color.text.muted",
    varName: "--text-muted",
    group: "text",
  },
  // Surfaces — translucent glass tones. Low alpha → page bg shows through.
  {
    label: "Surface 1",
    tokenName: "color.surface.1",
    varName: "--surface-1",
    group: "surface",
  },
  {
    label: "Surface 2",
    tokenName: "color.surface.2",
    varName: "--surface-2",
    group: "surface",
  },
  // Page background — the opaque base.
  {
    label: "Page Bg",
    tokenName: "color.bg.page",
    varName: "--bg-page",
    group: "bg",
  },
  {
    label: "Page Bg Soft",
    tokenName: "color.bg.page-soft",
    varName: "--bg-page-soft",
    group: "bg",
  },
];

/** `--accent` → `color.accent` */
export const VAR_TO_TOKEN: ReadonlyMap<string, string> = new Map(
  THEME_COLOR_TOKENS.map((t) => [t.varName, t.tokenName]),
);

/** `color.accent` → `--accent` */
export const TOKEN_TO_VAR: ReadonlyMap<string, string> = new Map(
  THEME_COLOR_TOKENS.map((t) => [t.tokenName, t.varName]),
);

/** The token map stored on the document root's style.provider Unit. Each
 *  token resolves to a CSS `var(--*)` string so CSS does the theme work. */
export function buildThemeTokenMap(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of THEME_COLOR_TOKENS) {
    out[t.tokenName] = `var(${t.varName})`;
  }
  return out;
}

/** Recognize the ColorPicker's theme-swatch emit format: `var(--accent)`. */
export function parseVarRef(
  str: string,
): { readonly varName: string; readonly tokenName: string } | null {
  const m = str.trim().match(/^var\(\s*(--[a-z0-9_-]+)\s*\)$/i);
  if (!m?.[1]) return null;
  const tokenName = VAR_TO_TOKEN.get(m[1]);
  if (tokenName === undefined) return null;
  return { varName: m[1], tokenName };
}

/** Build a `StyleRef` for a known token name. Returns null when the name
 *  isn't part of the theme registry — callers fall back to literal storage. */
export function toStyleRefFromVar(varName: string): StyleRef | null {
  const tokenName = VAR_TO_TOKEN.get(varName);
  if (tokenName === undefined) return null;
  return ref(tokenName);
}
