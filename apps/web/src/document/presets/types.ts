// WI-030 — Slide layout preset types.
//
// Open registry pattern. A `Preset` is identified by a stable id, lives under
// exactly one `PresetCategory`, and exposes (a) a `factory` that returns a
// pre-populated slide AgocraftItem (with its children grafted), and (b) a
// `renderThumbnail` for the picker's silhouette preview. Callers locate
// presets via `presetId` only — never by `switch (categoryId)` or
// `switch (presetId)` (OS Rule 6).

import type { Item as AgocraftItem, LocalizedText } from "@agocraft/core";

export type PresetCategoryId = string;
export type PresetId = string;

export interface PresetCategory {
  readonly id: PresetCategoryId;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  /** Display order — lower first. */
  readonly order: number;
}

export interface PresetFactoryContext {
  /** UI locale used when resolving `LocalizedText` to the seeded child
   *  Item strings. Falls back to `en` on unknown values. */
  readonly locale: "ko" | "en";
  /** Generate a fresh AgocraftItem id. The host injects this so the preset
   *  factory stays pure (no Date.now / Math.random captured at module load).
   *  Returns a stable string (e.g., uuid v7 or weave's `<kind>-<ts>-<rand>`). */
  readonly newId: (prefix: string) => string;
  /** ISO timestamp for the created Items' meta. Single value for the whole
   *  subtree so the items share a `createdAt`. */
  readonly now: string;
}

/**
 * Returns the slide AgocraftItem with its children pre-populated.
 *
 * Per FR-003 §F1: this single Item — with its children grafted — is staged
 * via `PendingCreations` once, and a single `item.children` patch on the
 * design root inserts the whole subtree as one history entry. `Cmd+Z` reverts
 * the entire preset.
 */
export type PresetFactory = (ctx: PresetFactoryContext) => AgocraftItem;

export interface Preset {
  readonly id: PresetId;
  readonly categoryId: PresetCategoryId;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  /** Display order within the category — lower first. */
  readonly order: number;
  /** Produce the slide subtree. */
  readonly factory: PresetFactory;
}

export interface PresetRegistry {
  readonly registerCategory: (category: PresetCategory) => () => void;
  readonly registerPreset: (preset: Preset) => () => void;
  readonly getCategory: (id: PresetCategoryId) => PresetCategory | undefined;
  readonly getPreset: (id: PresetId) => Preset | undefined;
  readonly listCategories: () => ReadonlyArray<PresetCategory>;
  readonly listPresetsByCategory: (categoryId: PresetCategoryId) => ReadonlyArray<Preset>;
  readonly listAllPresets: () => ReadonlyArray<Preset>;
}

/** Resolve a `LocalizedText` to the active locale string, with English
 *  fallback per WI-026's policy. */
export function resolveLocalizedText(text: LocalizedText, locale: "ko" | "en"): string {
  return text[locale] ?? text.en ?? text.ko ?? "";
}
