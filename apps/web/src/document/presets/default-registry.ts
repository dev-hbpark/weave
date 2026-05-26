// WI-030 — Default preset registry. Single bootstrap site (per OS Rule 6:
// adding a category or preset = add to this file's array + a new file under
// `presets/<category>/`; the registry's `get` / `list` doesn't change).
//
// 5 categories × 5 presets each = 25 starting points covering the typical
// deck arc (cover → agenda → divider → content → closing).

import { agendaCategory, agendaPresets } from "./agenda/index.js";
import { closingCategory, closingPresets } from "./closing/index.js";
import { contentCategory, contentPresets } from "./content/index.js";
import { coverCategory, coverPresets } from "./cover/index.js";
import { dividerCategory, dividerPresets } from "./divider/index.js";
import { createPresetRegistry } from "./registry.js";
import type { Preset, PresetCategory, PresetRegistry } from "./types.js";

/** All categories registered out-of-the-box. */
const CATEGORIES: ReadonlyArray<PresetCategory> = [
  coverCategory,
  agendaCategory,
  dividerCategory,
  contentCategory,
  closingCategory,
];

/** All presets registered out-of-the-box. */
const PRESETS: ReadonlyArray<Preset> = [
  ...coverPresets,
  ...agendaPresets,
  ...dividerPresets,
  ...contentPresets,
  ...closingPresets,
];

/** Build a fresh registry populated with the default catalog. Tests can
 *  instead call `createPresetRegistry()` directly to start empty. */
export function createDefaultPresetRegistry(): PresetRegistry {
  const r = createPresetRegistry();
  for (const c of CATEGORIES) r.registerCategory(c);
  for (const p of PRESETS) r.registerPreset(p);
  return r;
}

/** Module-level singleton — the host (DesignPage, command builder) reads
 *  through this. Cheap to construct, but a single instance avoids redundant
 *  registration. */
let cached: PresetRegistry | undefined;
export function defaultPresetRegistry(): PresetRegistry {
  if (cached === undefined) {
    cached = createDefaultPresetRegistry();
  }
  return cached;
}
