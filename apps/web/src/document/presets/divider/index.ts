// WI-030 — Section divider (섹션 구분) category presets. 5 variants used to
// separate chapters or major sections inside a deck.

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

export const dividerCategory: PresetCategory = {
  id: "divider",
  label: { ko: "섹션 구분", en: "Section divider" },
  description: {
    ko: "챕터·섹션 사이의 호흡 슬라이드",
    en: "Breath-slides between chapters or sections",
  },
  order: 3,
};

const SECTION_TITLE = { ko: "섹션 제목", en: "Section Title" } as const;
const CHAPTER_TAG = { ko: "Chapter 01", en: "Chapter 01" } as const;
const QUOTE_TEXT = {
  ko: "“핵심 메시지를 한 줄로 새겨두세요.”",
  en: "“A single line of conviction worth remembering.”",
} as const;

// section-number — big "01" + section title underneath
const sectionNumberPreset: Preset = {
  id: "divider.section-number",
  categoryId: "divider",
  label: { ko: "구분 — 번호", en: "Divider — Number" },
  description: { ko: "큰 번호 + 섹션 제목.", en: "Big number + section title." },
  order: 1,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const num = buildTextChild(
      build,
      { x: 0.08, y: 0.3, width: 0.84, height: 0.32, rotation: 0 },
      {
        text: "01",
        fontSize: 96,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const title = buildTextChild(
      build,
      { x: 0.08, y: 0.66, width: 0.84, height: 0.14, rotation: 0 },
      {
        text: resolveLocalizedText(SECTION_TITLE, ctx.locale),
        fontSize: 32,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      num,
      title,
    ]);
  },
};

// chapter-tag — small "Chapter 01" eyebrow + heading
const chapterTagPreset: Preset = {
  id: "divider.chapter",
  categoryId: "divider",
  label: { ko: "구분 — Chapter 태그", en: "Divider — Chapter tag" },
  description: { ko: "작은 챕터 태그 + 큰 헤드라인.", en: "Small chapter tag + big heading." },
  order: 2,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const tag = buildTextChild(
      build,
      { x: 0.1, y: 0.34, width: 0.8, height: 0.08, rotation: 0 },
      {
        text: resolveLocalizedText(CHAPTER_TAG, ctx.locale),
        fontSize: 14,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const head = buildTextChild(
      build,
      { x: 0.1, y: 0.46, width: 0.8, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(SECTION_TITLE, ctx.locale),
        fontSize: 48,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      tag,
      head,
    ]);
  },
};

// fullbleed — full-bleed accent background + centered title
const fullbleedPreset: Preset = {
  id: "divider.fullbleed",
  categoryId: "divider",
  label: { ko: "구분 — Full bleed", en: "Divider — Full bleed" },
  description: {
    ko: "액센트 풀 블리드 배경 + 중앙 타이틀.",
    en: "Accent full-bleed background + centered title.",
  },
  order: 3,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const bg = buildShapeChild(
      build,
      { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent-soft)") },
    );
    const title = buildTextChild(
      build,
      { x: 0.1, y: 0.42, width: 0.8, height: 0.16, rotation: 0 },
      {
        text: resolveLocalizedText(SECTION_TITLE, ctx.locale),
        fontSize: 44,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      bg,
      title,
    ]);
  },
};

// left-accent — vertical left accent bar + section text
const leftAccentPreset: Preset = {
  id: "divider.left-accent",
  categoryId: "divider",
  label: { ko: "구분 — 좌측 액센트", en: "Divider — Left accent" },
  description: {
    ko: "왼쪽 세로 액센트 바 + 섹션 텍스트.",
    en: "Left vertical accent bar + section text.",
  },
  order: 4,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const bar = buildShapeChild(
      build,
      { x: 0.06, y: 0.3, width: 0.012, height: 0.4, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent)") },
    );
    const eyebrow = buildTextChild(
      build,
      { x: 0.12, y: 0.34, width: 0.8, height: 0.08, rotation: 0 },
      {
        text: resolveLocalizedText(CHAPTER_TAG, ctx.locale),
        fontSize: 13,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const title = buildTextChild(
      build,
      { x: 0.12, y: 0.46, width: 0.8, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(SECTION_TITLE, ctx.locale),
        fontSize: 40,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      bar,
      eyebrow,
      title,
    ]);
  },
};

// quote — center pull-quote style with quotation marks
const quotePreset: Preset = {
  id: "divider.quote",
  categoryId: "divider",
  label: { ko: "구분 — Pull quote", en: "Divider — Pull quote" },
  description: {
    ko: "중앙 풀-쿼트 한 줄. 메시지 강조용.",
    en: "Centered pull quote. For emphasizing a single message.",
  },
  order: 5,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const quote = buildTextChild(
      build,
      { x: 0.1, y: 0.4, width: 0.8, height: 0.2, rotation: 0 },
      {
        text: resolveLocalizedText(QUOTE_TEXT, ctx.locale),
        fontSize: 28,
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const divider = buildShapeChild(
      build,
      { x: 0.46, y: 0.66, width: 0.08, height: 0.004, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent)") },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      quote,
      divider,
    ]);
  },
};

export const dividerPresets = [
  sectionNumberPreset,
  chapterTagPreset,
  fullbleedPreset,
  leftAccentPreset,
  quotePreset,
] as const;
