// WI-030 — Cover preset variant 1: "bold" — left-aligned big headline +
// subtitle + small meta line. Business tone.
//
// Layout (all coordinates in 0..1 ratio of the slide's frame):
//
//   ┌──────────────────────────────────┐
//   │ ▆ (accent bar 6% wide)          │
//   │                                  │
//   │ Big Headline                     │   ← y≈0.30, 70% width, fontSize 84
//   │ ────                             │
//   │ Subtitle text here               │   ← y≈0.50, 70% width, fontSize 32
//   │                                  │
//   │ 2026 · Author Name               │   ← y≈0.78, 50% width, fontSize 16
//   └──────────────────────────────────┘

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import { type BuildContext, buildFrameRoot, buildShapeChild, buildTextChild } from "../builders.js";
import type { Preset, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

const LABEL = { ko: "표지 — Bold", en: "Cover — Bold" } as const;
const DESCRIPTION = {
  ko: "왼쪽 정렬 큰 헤드라인 + 부제 + 메타. 비즈니스 톤.",
  en: "Left-aligned big headline + subtitle + meta. Business tone.",
} as const;

const SAMPLE_TITLE = { ko: "제목을 입력하세요", en: "Your Headline Here" } as const;
const SAMPLE_SUBTITLE = {
  ko: "한 줄 부제로 맥락을 더하세요",
  en: "Add a single-line subtitle for context",
} as const;
const SAMPLE_META = {
  ko: "2026 · 작성자",
  en: "2026 · Author",
} as const;

export const coverBoldPreset: Preset = {
  id: "cover.bold",
  categoryId: "cover",
  label: LABEL,
  description: DESCRIPTION,
  order: 1,
  factory: (ctx: PresetFactoryContext): AgocraftItem => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };

    const accentBar = buildShapeChild(
      build,
      { x: 0.08, y: 0.16, width: 0.04, height: 0.04, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent)") },
    );

    const title = buildTextChild(
      build,
      { x: 0.08, y: 0.32, width: 0.84, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 40,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    const subtitle = buildTextChild(
      build,
      { x: 0.08, y: 0.58, width: 0.84, height: 0.1, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_SUBTITLE, ctx.locale),
        fontSize: 18,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    const meta = buildTextChild(
      build,
      { x: 0.08, y: 0.82, width: 0.5, height: 0.06, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_META, ctx.locale),
        fontSize: 12,
        color: "var(--text-soft)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );

    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      accentBar,
      title,
      subtitle,
      meta,
    ]);
  },
};
