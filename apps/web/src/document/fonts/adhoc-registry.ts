// WI-136 follow-up — runtime ad-hoc font registry.
//
// Fonts chosen via "모든 폰트 찾아보기" (FontBrowseDialog) are NOT in the curated
// FONT_CATALOG. This registry holds those ad-hoc FontEntry objects and persists
// them to localStorage so they survive a reload. It lets:
//   • the loader resolve an ad-hoc stack precisely (vs. best-effort parsing),
//   • the theme typography surface (TypographyPicker) reference an ad-hoc font
//     by id — a theme role default can be any Google font, not just a catalog one.
//
// One-way dependency: this imports catalog types/lookups; catalog never imports
// this (no cycle).

import { FONT_BY_ID, type FontEntry } from "./catalog.js";

const STORAGE_KEY = "weave.fonts.adhoc";

const byId = new Map<string, FontEntry>();
const byStack = new Map<string, FontEntry>();

function isFontEntry(v: unknown): v is FontEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.label === "string" &&
    typeof e.stack === "string" &&
    typeof e.family === "string" &&
    (e.source === "google" || e.source === "system") &&
    typeof e.category === "string" &&
    Array.isArray(e.subsets) &&
    Array.isArray(e.weights)
  );
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...byId.values()]));
  } catch {
    /* quota / private mode — ad-hoc fonts just won't survive reload */
  }
}

function hydrate(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (isFontEntry(entry)) {
        byId.set(entry.id, entry);
        byStack.set(entry.stack, entry);
      }
    }
  } catch {
    /* corrupt payload — start empty */
  }
}

hydrate();

/** Record an ad-hoc font so it resolves by id / stack and survives reload.
 *  No-op when the id already belongs to the curated catalog. */
export function registerAdHocFont(entry: FontEntry): void {
  if (FONT_BY_ID.has(entry.id) || byId.has(entry.id)) return;
  byId.set(entry.id, entry);
  byStack.set(entry.stack, entry);
  persist();
}

export function adHocById(id: string): FontEntry | undefined {
  return byId.get(id);
}

export function adHocByStack(stack: string): FontEntry | undefined {
  return byStack.get(stack);
}

/** Resolve a font id against the curated catalog first, then the ad-hoc
 *  registry. The single lookup callers should use when an id may be either. */
export function resolveFontEntryById(id: string): FontEntry | undefined {
  return FONT_BY_ID.get(id) ?? byId.get(id);
}

/** Test-only: clear the in-memory registry (does not touch localStorage). */
export function __resetAdHocForTest(): void {
  byId.clear();
  byStack.clear();
}
