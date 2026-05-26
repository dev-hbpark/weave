// WI-030 — Open preset registry. Same pattern as the manipulation registry
// (DR-010) — Map-backed, register-returns-disposer, lookup is pure.

import type {
  Preset,
  PresetCategory,
  PresetCategoryId,
  PresetId,
  PresetRegistry,
} from "./types.js";

export function createPresetRegistry(): PresetRegistry {
  const categories = new Map<PresetCategoryId, PresetCategory>();
  const presets = new Map<PresetId, Preset>();

  function registerCategory(category: PresetCategory): () => void {
    if (categories.has(category.id)) {
      console.warn(
        `[preset-registry] Category "${category.id}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    categories.set(category.id, category);
    return () => {
      categories.delete(category.id);
    };
  }

  function registerPreset(preset: Preset): () => void {
    if (presets.has(preset.id)) {
      console.warn(
        `[preset-registry] Preset "${preset.id}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    if (!categories.has(preset.categoryId)) {
      console.warn(
        `[preset-registry] Preset "${preset.id}" references unknown category "${preset.categoryId}" — register the category first.`,
      );
    }
    presets.set(preset.id, preset);
    return () => {
      presets.delete(preset.id);
    };
  }

  function listCategories(): ReadonlyArray<PresetCategory> {
    return Array.from(categories.values()).sort((a, b) => a.order - b.order);
  }

  function listPresetsByCategory(categoryId: PresetCategoryId): ReadonlyArray<Preset> {
    const out: Preset[] = [];
    for (const p of presets.values()) {
      if (p.categoryId === categoryId) out.push(p);
    }
    return out.sort((a, b) => a.order - b.order);
  }

  function listAllPresets(): ReadonlyArray<Preset> {
    return Array.from(presets.values()).sort((a, b) => {
      const ca = categories.get(a.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
      const cb = categories.get(b.categoryId)?.order ?? Number.MAX_SAFE_INTEGER;
      if (ca !== cb) return ca - cb;
      return a.order - b.order;
    });
  }

  return {
    registerCategory,
    registerPreset,
    getCategory: (id) => categories.get(id),
    getPreset: (id) => presets.get(id),
    listCategories,
    listPresetsByCategory,
    listAllPresets,
  };
}
