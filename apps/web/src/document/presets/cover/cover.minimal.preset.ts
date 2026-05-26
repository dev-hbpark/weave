// WI-030 — Cover preset variant 4: "minimal" — a single centered title with
// a thin horizontal divider underneath. Quiet, editorial tone.
//
//   ┌──────────────────────────────────┐
//   │                                  │
//   │           Title                  │   ← centered, fontSize 56
//   │           ────                   │   ← thin divider line
//   │                                  │
//   └──────────────────────────────────┘

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import { type BuildContext, buildFrameRoot, buildShapeChild, buildTextChild } from "../builders.js";
import type { Preset, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

const LABEL = { ko: "표지 — Minimal", en: "Cover — Minimal" } as const;
const DESCRIPTION = {
  ko: "중앙 정렬 타이틀 + 얇은 구분선. 조용한 에디토리얼 톤.",
  en: "Centered title + thin divider. Quiet editorial tone.",
} as const;

const SAMPLE_TITLE = { ko: "제목을 입력하세요", en: "Your Title" } as const;

export const coverMinimalPreset: Preset = {
  id: "cover.minimal",
  categoryId: "cover",
  label: LABEL,
  description: DESCRIPTION,
  order: 4,
  factory: (ctx: PresetFactoryContext): AgocraftItem => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };

    const title = buildTextChild(
      build,
      { x: 0.1, y: 0.42, width: 0.8, height: 0.12, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 36,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );

    const divider = buildShapeChild(
      build,
      { x: 0.42, y: 0.58, width: 0.16, height: 0.005, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--text-soft)") },
    );

    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      title,
      divider,
    ]);
  },
};
