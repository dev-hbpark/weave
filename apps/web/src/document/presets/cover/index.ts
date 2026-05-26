// WI-030 — Cover category presets aggregate. Phase 1 = 3 variants.

import type { PresetCategory } from "../types.js";
import { coverAsymmetricPreset } from "./cover.asymmetric.preset.js";
import { coverBoldPreset } from "./cover.bold.preset.js";
import { coverHeroPreset } from "./cover.hero.preset.js";

export const coverCategory: PresetCategory = {
  id: "cover",
  label: { ko: "표지", en: "Cover" },
  description: {
    ko: "데크 첫 슬라이드 — 타이틀과 메타 정보",
    en: "Deck opener — title and meta",
  },
  order: 1,
};

export const coverPresets = [coverBoldPreset, coverHeroPreset, coverAsymmetricPreset] as const;
