// WI-030 — Cover preset variant 2: "hero" — centered big title + subtitle
// over an accent backdrop shape. Presentation tone.
//
//   ┌──────────────────────────────────┐
//   │            ▆▆▆▆▆                │   ← accent backdrop circle behind title
//   │           Title                  │   ← centered, fontSize 96
//   │         ──────────               │
//   │          Subtitle                │   ← centered, fontSize 28
//   │                                  │
//   └──────────────────────────────────┘

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import { type BuildContext, buildFrameRoot, buildShapeChild, buildTextChild } from "../builders.js";
import type { Preset, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

const LABEL = { ko: "표지 — Hero", en: "Cover — Hero" } as const;
const DESCRIPTION = {
  ko: "중앙 정렬 타이틀 + 부제 + 액센트 배경 도형. 발표 톤.",
  en: "Centered title + subtitle + accent backdrop. Presentation tone.",
} as const;

const SAMPLE_TITLE = { ko: "제목을 입력하세요", en: "Your Title Here" } as const;
const SAMPLE_SUBTITLE = {
  ko: "부제 한 줄로 맥락 추가",
  en: "Add a subtitle for context",
} as const;

export const coverHeroPreset: Preset = {
  id: "cover.hero",
  categoryId: "cover",
  label: LABEL,
  description: DESCRIPTION,
  order: 2,
  factory: (ctx: PresetFactoryContext): AgocraftItem => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };

    const backdrop = buildShapeChild(
      build,
      { x: 0.3, y: 0.28, width: 0.4, height: 0.36, rotation: 0 },
      "ellipse",
      { fill: paintSolid("var(--accent-soft)"), opacity: 0.85 },
    );

    const title = buildTextChild(
      build,
      { x: 0.1, y: 0.38, width: 0.8, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 48,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );

    const subtitle = buildTextChild(
      build,
      { x: 0.15, y: 0.62, width: 0.7, height: 0.1, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_SUBTITLE, ctx.locale),
        fontSize: 20,
        color: "var(--text-default)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );

    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      backdrop,
      title,
      subtitle,
    ]);
  },
};
