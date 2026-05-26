// WI-030 — Content (본문) category presets. 5 variants for typical body
// slides: title + body / two-column / bullet list / image + caption /
// stat-headline.

import type { Item as AgocraftItem } from "@agocraft/core";
import { paintSolid } from "@agocraft/core";
import {
  type BuildContext,
  buildFrameRoot,
  buildShapeChild,
  buildTextChild,
} from "../builders.js";
import type { Preset, PresetCategory, PresetFactoryContext } from "../types.js";
import { resolveLocalizedText } from "../types.js";

export const contentCategory: PresetCategory = {
  id: "content",
  label: { ko: "본문", en: "Content" },
  description: {
    ko: "본문 슬라이드의 다섯 가지 흔한 구성",
    en: "Five common layouts for body slides",
  },
  order: 4,
};

const SAMPLE_TITLE = { ko: "본문 제목", en: "Content Title" } as const;
const SAMPLE_BODY = {
  ko: "여기에 본문 단락을 작성하세요. 핵심 메시지 1~2 문장으로 충분합니다.",
  en: "Write the body paragraph here. One or two sentences are usually enough.",
} as const;
const BULLETS_KO = ["첫 번째 핵심", "두 번째 핵심", "세 번째 핵심", "네 번째 핵심", "다섯 번째 핵심"] as const;
const BULLETS_EN = [
  "First key point",
  "Second key point",
  "Third key point",
  "Fourth key point",
  "Fifth key point",
] as const;

function titleAt(
  build: BuildContext,
  ctx: PresetFactoryContext,
  width = 0.84,
): AgocraftItem {
  return buildTextChild(
    build,
    { x: 0.08, y: 0.1, width, height: 0.14, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 32,
      fontWeight: "bold",
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
}

// title-body — title + single paragraph
const titleBodyPreset: Preset = {
  id: "content.title-body",
  categoryId: "content",
  label: { ko: "본문 — 제목 + 단락", en: "Content — Title + body" },
  description: { ko: "타이틀 + 단락 한 덩어리.", en: "Title + a single paragraph." },
  order: 1,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const title = titleAt(build, ctx);
    const body = buildTextChild(
      build,
      { x: 0.08, y: 0.3, width: 0.84, height: 0.5, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_BODY, ctx.locale),
        fontSize: 18,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      title,
      body,
    ]);
  },
};

// two-column — title spans top + two body columns
const twoColumnPreset: Preset = {
  id: "content.two-column",
  categoryId: "content",
  label: { ko: "본문 — 2 컬럼", en: "Content — 2 columns" },
  description: { ko: "타이틀 + 좌/우 컬럼.", en: "Title + left & right columns." },
  order: 2,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const title = titleAt(build, ctx);
    const left = buildTextChild(
      build,
      { x: 0.08, y: 0.3, width: 0.4, height: 0.5, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_BODY, ctx.locale),
        fontSize: 16,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const right = buildTextChild(
      build,
      { x: 0.52, y: 0.3, width: 0.4, height: 0.5, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_BODY, ctx.locale),
        fontSize: 16,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      title,
      left,
      right,
    ]);
  },
};

// bullet-list — title + 5 bullet rows
const bulletListPreset: Preset = {
  id: "content.bullet-list",
  categoryId: "content",
  label: { ko: "본문 — Bullet list", en: "Content — Bullet list" },
  description: { ko: "타이틀 + 5개 불릿.", en: "Title + 5 bullets." },
  order: 3,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const title = titleAt(build, ctx);
    const bullets = (ctx.locale === "ko" ? BULLETS_KO : BULLETS_EN).map((text, i) =>
      buildTextChild(
        build,
        { x: 0.1, y: 0.3 + i * 0.1, width: 0.82, height: 0.09, rotation: 0 },
        {
          text: `•  ${text}`,
          fontSize: 18,
          color: "var(--text-default)",
          textAlignHorizontal: "LEFT",
          textAlign: "left",
        },
      ),
    );
    return buildFrameRoot(
      build,
      { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      [title, ...bullets],
    );
  },
};

// image-caption — image placeholder + caption text
const imageCaptionPreset: Preset = {
  id: "content.image-caption",
  categoryId: "content",
  label: { ko: "본문 — 이미지 + 캡션", en: "Content — Image + caption" },
  description: {
    ko: "왼쪽 이미지 자리 + 오른쪽 제목과 설명.",
    en: "Left image placeholder + right title & caption.",
  },
  order: 4,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const imagePlaceholder = buildShapeChild(
      build,
      { x: 0.08, y: 0.16, width: 0.4, height: 0.68, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--surface-2)") },
    );
    const imageLabel = buildTextChild(
      build,
      { x: 0.08, y: 0.46, width: 0.4, height: 0.08, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "이미지" : "Image",
        fontSize: 14,
        color: "var(--text-muted)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const title = buildTextChild(
      build,
      { x: 0.54, y: 0.2, width: 0.4, height: 0.14, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
        fontSize: 28,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const body = buildTextChild(
      build,
      { x: 0.54, y: 0.4, width: 0.4, height: 0.5, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_BODY, ctx.locale),
        fontSize: 16,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      imagePlaceholder,
      imageLabel,
      title,
      body,
    ]);
  },
};

// stat-headline — big stat number + label + description
const statHeadlinePreset: Preset = {
  id: "content.stat-headline",
  categoryId: "content",
  label: { ko: "본문 — 큰 수치", en: "Content — Stat headline" },
  description: {
    ko: "지표 강조 — 큰 수치 + 라벨 + 설명.",
    en: "Metric spotlight — big stat + label + description.",
  },
  order: 5,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const stat = buildTextChild(
      build,
      { x: 0.08, y: 0.24, width: 0.84, height: 0.34, rotation: 0 },
      {
        text: "87%",
        fontSize: 120,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const label = buildTextChild(
      build,
      { x: 0.08, y: 0.62, width: 0.84, height: 0.1, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "전년 대비 증가" : "Year-over-year growth",
        fontSize: 22,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const desc = buildTextChild(
      build,
      { x: 0.08, y: 0.74, width: 0.84, height: 0.16, rotation: 0 },
      {
        text: resolveLocalizedText(SAMPLE_BODY, ctx.locale),
        fontSize: 16,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      stat,
      label,
      desc,
    ]);
  },
};

export const contentPresets = [
  titleBodyPreset,
  twoColumnPreset,
  bulletListPreset,
  imageCaptionPreset,
  statHeadlinePreset,
] as const;
