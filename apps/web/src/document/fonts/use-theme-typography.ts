// WI-136 — per-theme typography overrides (the "테마에서 폰트 관리" surface).
//
// Parallels design-system `useTheme`: the active theme is the key, and each
// theme remembers its own {display, body, mono} font choices. Applying an
// override sets the corresponding CSS var (`--font-display` / `--font-sans` /
// `--font-mono`) INLINE on <html> — inline wins over the base / [data-theme]
// cascade — and loads the font on demand. Clearing an override removes the
// inline var so the theme's CSS default wins again.
//
// Text bound to a font ROLE (`var(--font-*)`, the default for new text) then
// follows these per-theme choices with no document mutation, exactly like the
// color-token cascade. A text item with an explicit catalog font is unaffected.

import { useTheme } from "@weave/design-system";
import { useCallback, useEffect, useState } from "react";
import { resolveFontEntryById } from "./adhoc-registry.js";
import { FONT_ROLES, type FontRole } from "./catalog.js";
import { ensureFontLoaded } from "./font-loader.js";
import { themeTypographyDefault } from "./theme-typography-defaults.js";

export type RoleId = FontRole["id"];

/** roleId → catalog font id, per role. Absent role = theme default. */
export type ThemeTypography = Partial<Record<RoleId, string>>;

/** themeName → its typography overrides. */
type TypographyMap = Record<string, ThemeTypography>;

const STORAGE_KEY = "weave.typography";

function readStored(): TypographyMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as TypographyMap) : {};
  } catch {
    return {};
  }
}

function writeStored(map: TypographyMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — overrides simply don't persist */
  }
}

/** Effective font for a role = user override ?? theme default ?? base font. */
function effectiveFontId(
  overrides: ThemeTypography,
  defaults: ThemeTypography,
  roleId: RoleId,
): string | undefined {
  return overrides[roleId] ?? defaults[roleId];
}

/** Apply the inline CSS font vars on <html> for the active theme, layering the
 *  user's overrides over the theme's defaults, and load any referenced webfont.
 *  Roles with neither are cleared so the base `--font-*` resurfaces. */
function applyTypography(overrides: ThemeTypography, defaults: ThemeTypography): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const role of FONT_ROLES) {
    const fontId = effectiveFontId(overrides, defaults, role.id);
    const entry = fontId !== undefined ? resolveFontEntryById(fontId) : undefined;
    if (entry !== undefined) {
      ensureFontLoaded(entry);
      root.style.setProperty(role.varName, entry.stack);
    } else {
      root.style.removeProperty(role.varName);
    }
  }
}

export interface UseThemeTypographyResult {
  /** Active theme name (mirrors design-system useTheme). */
  readonly theme: string;
  /** The active theme's USER overrides (roleId → font id). */
  readonly current: ThemeTypography;
  /** The active theme's built-in defaults (roleId → font id). A role absent
   *  here AND in `current` falls through to the base `--font-*`. */
  readonly defaults: ThemeTypography;
  /** Set (fontId) or clear (null) the active theme's font for a role. Clearing
   *  reverts the role to the theme default (or base). */
  readonly setRole: (roleId: RoleId, fontId: string | null) => void;
  /** Clear all user overrides for the active theme (revert to its defaults). */
  readonly resetTheme: () => void;
}

export function useThemeTypography(): UseThemeTypographyResult {
  const { theme } = useTheme();
  const [map, setMap] = useState<TypographyMap>(readStored);
  const current = map[theme] ?? {};
  const defaults = themeTypographyDefault(theme);

  // Re-apply whenever the theme or its overrides change. Keyed on primitive
  // role values (not the `current` object, whose `{}` identity changes every
  // render when there are no overrides → would re-apply in a loop). The theme
  // dep covers the (static-per-theme) defaults.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional primitive keys, not the object identity
  useEffect(() => {
    applyTypography(current, defaults);
  }, [theme, current.display, current.body, current.mono]);

  const setRole = useCallback(
    (roleId: RoleId, fontId: string | null) => {
      setMap((prev) => {
        const themeMap: ThemeTypography = { ...(prev[theme] ?? {}) };
        if (fontId === null) delete themeMap[roleId];
        else themeMap[roleId] = fontId;
        const next: TypographyMap = { ...prev, [theme]: themeMap };
        writeStored(next);
        return next;
      });
    },
    [theme],
  );

  const resetTheme = useCallback(() => {
    setMap((prev) => {
      const next: TypographyMap = { ...prev };
      delete next[theme];
      writeStored(next);
      return next;
    });
  }, [theme]);

  return { theme, current, defaults, setRole, resetTheme };
}
