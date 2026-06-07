// WI-136 — On-demand webfont loader.
//
// Replaces the giant static Google Fonts `<link>` in index.html. A font is
// fetched only when it is actually needed: picked in the toolbar, hovered for
// preview, set as a theme typography default, or found on a text item when a
// saved document is opened (rehydration).
//
// Rule 6: dispatch on `source` is a registry of adapters, never a `switch`.
// Adding a source (e.g. self-hosted woff2) = one adapter entry.

import { adHocByStack } from "./adhoc-registry.js";
import { FONT_BY_ID, FONT_BY_STACK, type FontEntry } from "./catalog.js";

/** ids whose `<link>` has already been injected — dedup guard. */
const loaded = new Set<string>();

function googleCss2Href(entry: FontEntry): string {
  const family = entry.family.replace(/ /g, "+");
  const weights = entry.weights.length > 0 ? entry.weights : [400];
  const axis = `:wght@${[...weights].sort((a, b) => a - b).join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${family}${axis}&display=swap`;
}

function injectGoogleLink(entry: FontEntry): void {
  // SSR / non-DOM guard (unit tests, headless serialization).
  if (typeof document === "undefined") return;
  const href = googleCss2Href(entry);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.weaveFont = entry.id;
  document.head.appendChild(link);
}

/** source → loader adapter. `system` fonts need no network. */
const LOADERS: Record<FontEntry["source"], (entry: FontEntry) => void> = {
  system: () => {},
  google: injectGoogleLink,
};

/** Ensure `entry`'s webfont is available, injecting its stylesheet once. */
export function ensureFontLoaded(entry: FontEntry): void {
  if (loaded.has(entry.id)) return;
  loaded.add(entry.id);
  LOADERS[entry.source](entry);
}

/** Load by catalog id (no-op for unknown ids). */
export function ensureFontById(id: string): void {
  const entry = FONT_BY_ID.get(id);
  if (entry !== undefined) ensureFontLoaded(entry);
}

/** Load the font for a stored `fontFamily` stack, if it maps to a catalog
 *  entry. Theme-role values (`var(--font-*)`) and unknown literals are
 *  ignored here — roles are satisfied by the theme's own font loading. */
export function ensureFontByStack(stack: string): void {
  const entry = FONT_BY_STACK.get(stack) ?? adHocByStack(stack);
  if (entry !== undefined) {
    ensureFontLoaded(entry);
    return;
  }
  // Legacy / unregistered stack not in the curated catalog or the ad-hoc
  // registry. If it leads with a quoted family, best-effort load it from Google
  // Fonts so the text renders in that face on reopen. A stack with no leading
  // quoted family (system stacks like `ui-sans-serif, …`) is left alone, and an
  // unknown family simply yields an empty stylesheet (harmless no-op).
  const family = leadingQuotedFamily(stack);
  if (family !== null) ensureGoogleFamily(family);
}

/** The family inside a stack's leading quotes (`'Roboto Slab', …` → "Roboto
 *  Slab"), or null when the stack starts unquoted. */
function leadingQuotedFamily(stack: string): string | null {
  const m = stack.trim().match(/^['"]([^'"]+)['"]/);
  return m?.[1] ?? null;
}

/** Best-effort load of an arbitrary Google family at default weights — used for
 *  ad-hoc / legacy stacks during rehydration. Deduped under a `gf:` key so it
 *  never collides with a catalog id. */
function ensureGoogleFamily(family: string): void {
  const key = `gf:${family}`;
  if (loaded.has(key)) return;
  loaded.add(key);
  if (typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;700&display=swap`;
  link.dataset.weaveFont = key;
  document.head.appendChild(link);
}

/** Rehydration entry point — load every catalog font referenced by the given
 *  set of stored `fontFamily` values (e.g. scanned from a freshly-opened
 *  document's text items). Deduped internally. */
export function ensureFontsForValues(values: Iterable<string>): void {
  for (const v of values) ensureFontByStack(v);
}

/** Test-only: reset the dedup guard so a suite can re-assert injection. */
export function __resetLoadedFontsForTest(): void {
  loaded.clear();
}
