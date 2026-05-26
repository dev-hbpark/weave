// WI-030 — Cover preset variant 5: "split" — vertical split with accent
// panel on the left and title/subtitle on the right. Editorial layout.
//
//   ┌──────────┬───────────────────────┐
//   │          │                       │
//   │  ▆▆▆▆▆▆  │  Title                │
//   │  accent  │  Subtitle             │
//   │          │                       │
//   └──────────┴───────────────────────┘

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import { type BuildContext, buildFrameRoot, buildShapeChild, buildTextChild } from "../builders.js";
import type { Preset, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

const LABEL = { ko: "표지 — Split", en: "Cover — Split" } as const;
const DESCRIPTION = {
  ko: "좌측 액센트 패널 + 우측 타이틀/부제. 에디토리얼 레이아웃.",
  en: "Left accent panel + right title/subtitle. Editorial layout.",
} as const;

const SAMPLE_TITLE = { ko: "제목을 입력하세요", en: "Your Title" } as const;
const SAMPLE_SUBTITLE = {
  ko: "부제로 맥락을 더하세요",
  en: "Add a subtitle for context",
} as const;

export const coverSplitPreset: Preset = {
  id: "cover.split",
  categoryId: "cover",
  label: LABEL,
  description: DESCRIPTION,
  order: 5,
  factory: (ctx: PresetFactoryContext): AgocraftItem => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };

    const accentPanel = buildShapeChild(
      build,
      { x: 0, y: 0, width: 0.36, height: 1, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent-soft)") },
    );

    const title = buildTextChild(
      build,
      { x: 0.44, y: 0.36, width: 0.5, height: 0.18, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 36,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    const subtitle = buildTextChild(
      build,
      { x: 0.44, y: 0.58, width: 0.5, height: 0.1, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_SUBTITLE, ctx.locale),
        fontSize: 16,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      accentPanel,
      title,
      subtitle,
    ]);
  },
};
