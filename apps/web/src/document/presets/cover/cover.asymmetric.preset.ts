// WI-030 — Cover preset variant 3: "asymmetric" — left third accent block,
// right two-thirds title + subtitle. Editorial / design tone.
//
//   ┌────┬──────────────────────────────┐
//   │████│                              │
//   │████│ Title                        │
//   │████│ ──────                       │
//   │████│ Subtitle                     │
//   │████│                              │
//   └────┴──────────────────────────────┘

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import { type BuildContext, buildFrameRoot, buildShapeChild, buildTextChild } from "../builders.js";
import type { Preset, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

const LABEL = { ko: "표지 — Asymmetric", en: "Cover — Asymmetric" } as const;
const DESCRIPTION = {
  ko: "왼쪽 1/3 액센트 블록 + 오른쪽 2/3 타이틀·부제. 디자인 톤.",
  en: "Left-third accent block + right-two-thirds title/subtitle. Editorial tone.",
} as const;

const SAMPLE_TITLE = { ko: "제목을 입력하세요", en: "Your Title Here" } as const;
const SAMPLE_SUBTITLE = {
  ko: "부제 한 줄로 맥락 추가",
  en: "Add a subtitle for context",
} as const;

export const coverAsymmetricPreset: Preset = {
  id: "cover.asymmetric",
  categoryId: "cover",
  label: LABEL,
  description: DESCRIPTION,
  order: 3,
  factory: (ctx: PresetFactoryContext): AgocraftItem => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };

    const accentBlock = buildShapeChild(
      build,
      { x: 0.0, y: 0.0, width: 0.33, height: 1.0, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent)") },
    );

    const title = buildTextChild(
      build,
      { x: 0.4, y: 0.34, width: 0.55, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 32,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    const subtitle = buildTextChild(
      build,
      { x: 0.4, y: 0.58, width: 0.55, height: 0.1, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_SUBTITLE, ctx.locale),
        fontSize: 18,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      accentBlock,
      title,
      subtitle,
    ]);
  },
};
