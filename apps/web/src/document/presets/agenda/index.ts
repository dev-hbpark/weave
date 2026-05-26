// WI-030 — Agenda (목차) category presets. 5 variants laying out a deck's
// table-of-contents in different rhythms (bulleted / numbered / 3-column /
// timeline strip / minimal).
//
// All presets follow the same OS Rule 6 contract: the factory returns a
// `frame` AgocraftItem with its children pre-grafted. No `switch (presetId)`
// — callers locate presets via the registry only.

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

export const agendaCategory: PresetCategory = {
  id: "agenda",
  label: { ko: "목차", en: "Agenda" },
  description: {
    ko: "발표의 흐름을 한 눈에 — 다섯 가지 구성",
    en: "Deck flow at a glance — five layouts",
  },
  order: 2,
};

const SAMPLE_TITLE = { ko: "목차", en: "Agenda" } as const;
const ITEMS_KO = ["배경", "현황 분석", "핵심 제안", "실행 계획", "다음 단계"] as const;
const ITEMS_EN = ["Background", "Analysis", "Proposal", "Plan", "Next steps"] as const;

function items(locale: "ko" | "en"): ReadonlyArray<string> {
  return locale === "ko" ? ITEMS_KO : ITEMS_EN;
}

// ─────────────────────────────────────────────────────────────────────────
// agenda.bullets — title + 5 stacked bullet rows
// ─────────────────────────────────────────────────────────────────────────
const agendaBulletsPreset: Preset = {
  id: "agenda.bullets",
  categoryId: "agenda",
  label: { ko: "목차 — Bullets", en: "Agenda — Bullets" },
  description: {
    ko: "타이틀 + 5개 항목 세로 리스트. 가장 무난한 형식.",
    en: "Title + 5 stacked bullets. The classic format.",
  },
  order: 1,
  factory: (ctx) => buildAgendaBullets(ctx),
};
function buildAgendaBullets(ctx: PresetFactoryContext): AgocraftItem {
  const build: BuildContext = { newId: ctx.newId, now: ctx.now };
  const title = buildTextChild(
    build,
    { x: 0.08, y: 0.1, width: 0.84, height: 0.14, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 36,
      fontWeight: "bold",
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
  const rows = items(ctx.locale).map((text, i) =>
    buildTextChild(
      build,
      { x: 0.12, y: 0.32 + i * 0.12, width: 0.76, height: 0.1, rotation: 0 },
      {
        text: `•  ${text}`,
        fontSize: 20,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    ),
  );
  return buildFrameRoot(
    build,
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
    [title, ...rows],
  );
}

// ─────────────────────────────────────────────────────────────────────────
// agenda.numbered — 4 prominent numbered rows (01 / 02 / 03 / 04)
// ─────────────────────────────────────────────────────────────────────────
const agendaNumberedPreset: Preset = {
  id: "agenda.numbered",
  categoryId: "agenda",
  label: { ko: "목차 — Numbered", en: "Agenda — Numbered" },
  description: {
    ko: "강조형 번호 + 항목 4개. 발표 톤.",
    en: "Bold numbers + 4 items. Presentation tone.",
  },
  order: 2,
  factory: (ctx) => buildAgendaNumbered(ctx),
};
function buildAgendaNumbered(ctx: PresetFactoryContext): AgocraftItem {
  const build: BuildContext = { newId: ctx.newId, now: ctx.now };
  const title = buildTextChild(
    build,
    { x: 0.08, y: 0.08, width: 0.84, height: 0.12, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 32,
      fontWeight: "bold",
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
  const labels = items(ctx.locale).slice(0, 4);
  const children: AgocraftItem[] = [title];
  labels.forEach((text, i) => {
    const num = buildTextChild(
      build,
      { x: 0.08, y: 0.28 + i * 0.16, width: 0.12, height: 0.14, rotation: 0 },
      {
        text: String(i + 1).padStart(2, "0"),
        fontSize: 36,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const label = buildTextChild(
      build,
      { x: 0.22, y: 0.3 + i * 0.16, width: 0.7, height: 0.12, rotation: 0 },
      {
        text,
        fontSize: 22,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    children.push(num, label);
  });
  return buildFrameRoot(
    build,
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
    children,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// agenda.three-column — title + 3 equal columns with mini-heading + body
// ─────────────────────────────────────────────────────────────────────────
const agendaThreeColumnPreset: Preset = {
  id: "agenda.three-column",
  categoryId: "agenda",
  label: { ko: "목차 — 3 컬럼", en: "Agenda — 3 columns" },
  description: {
    ko: "3 컬럼 개요 카드. 챕터형 데크 도입.",
    en: "3-column overview cards. Chapter-style intro.",
  },
  order: 3,
  factory: (ctx) => buildAgendaThreeColumn(ctx),
};
function buildAgendaThreeColumn(ctx: PresetFactoryContext): AgocraftItem {
  const build: BuildContext = { newId: ctx.newId, now: ctx.now };
  const title = buildTextChild(
    build,
    { x: 0.08, y: 0.1, width: 0.84, height: 0.14, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 32,
      fontWeight: "bold",
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
  const labels = items(ctx.locale).slice(0, 3);
  const children: AgocraftItem[] = [title];
  labels.forEach((text, i) => {
    const colX = 0.08 + i * 0.29;
    const card = buildShapeChild(
      build,
      { x: colX, y: 0.36, width: 0.26, height: 0.5, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--surface-2)") },
    );
    const num = buildTextChild(
      build,
      { x: colX + 0.02, y: 0.4, width: 0.22, height: 0.1, rotation: 0 },
      {
        text: String(i + 1).padStart(2, "0"),
        fontSize: 22,
        fontWeight: "bold",
        color: "var(--accent)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const label = buildTextChild(
      build,
      { x: colX + 0.02, y: 0.56, width: 0.22, height: 0.24, rotation: 0 },
      {
        text,
        fontSize: 18,
        color: "var(--text-default)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    children.push(card, num, label);
  });
  return buildFrameRoot(
    build,
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
    children,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// agenda.timeline — horizontal timeline of 5 dots + labels
// ─────────────────────────────────────────────────────────────────────────
const agendaTimelinePreset: Preset = {
  id: "agenda.timeline",
  categoryId: "agenda",
  label: { ko: "목차 — Timeline", en: "Agenda — Timeline" },
  description: {
    ko: "가로 타임라인 5단계.",
    en: "Horizontal 5-step timeline.",
  },
  order: 4,
  factory: (ctx) => buildAgendaTimeline(ctx),
};
function buildAgendaTimeline(ctx: PresetFactoryContext): AgocraftItem {
  const build: BuildContext = { newId: ctx.newId, now: ctx.now };
  const title = buildTextChild(
    build,
    { x: 0.08, y: 0.14, width: 0.84, height: 0.12, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 32,
      fontWeight: "bold",
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
  // Track line.
  const track = buildShapeChild(
    build,
    { x: 0.1, y: 0.54, width: 0.8, height: 0.006, rotation: 0 },
    "rectangle",
    { fill: paintSolid("var(--text-muted)") },
  );
  const labels = items(ctx.locale);
  const children: AgocraftItem[] = [title, track];
  labels.forEach((text, i) => {
    const x = 0.1 + (i / (labels.length - 1)) * 0.8;
    const dot = buildShapeChild(
      build,
      { x: x - 0.014, y: 0.52, width: 0.028, height: 0.05, rotation: 0 },
      "ellipse",
      { fill: paintSolid("var(--accent)") },
    );
    const label = buildTextChild(
      build,
      { x: x - 0.08, y: 0.62, width: 0.16, height: 0.16, rotation: 0 },
      {
        text,
        fontSize: 14,
        color: "var(--text-default)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    children.push(dot, label);
  });
  return buildFrameRoot(
    build,
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
    children,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// agenda.minimal — quiet title + thin divider + 3 lines
// ─────────────────────────────────────────────────────────────────────────
const agendaMinimalPreset: Preset = {
  id: "agenda.minimal",
  categoryId: "agenda",
  label: { ko: "목차 — Minimal", en: "Agenda — Minimal" },
  description: {
    ko: "조용한 타이틀 + 구분선 + 3개 항목.",
    en: "Quiet title + divider + 3 items.",
  },
  order: 5,
  factory: (ctx) => buildAgendaMinimal(ctx),
};
function buildAgendaMinimal(ctx: PresetFactoryContext): AgocraftItem {
  const build: BuildContext = { newId: ctx.newId, now: ctx.now };
  const title = buildTextChild(
    build,
    { x: 0.1, y: 0.22, width: 0.8, height: 0.12, rotation: 0 },
    {
      text: resolveLocalizedText(SAMPLE_TITLE, ctx.locale),
      fontSize: 28,
      color: "var(--text-strong)",
      textAlignHorizontal: "LEFT",
      textAlign: "left",
    },
  );
  const divider = buildShapeChild(
    build,
    { x: 0.1, y: 0.38, width: 0.16, height: 0.004, rotation: 0 },
    "rectangle",
    { fill: paintSolid("var(--text-soft)") },
  );
  const rows = items(ctx.locale)
    .slice(0, 3)
    .map((text, i) =>
      buildTextChild(
        build,
        { x: 0.1, y: 0.48 + i * 0.12, width: 0.8, height: 0.1, rotation: 0 },
        {
          text,
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
    [title, divider, ...rows],
  );
}

export const agendaPresets = [
  agendaBulletsPreset,
  agendaNumberedPreset,
  agendaThreeColumnPreset,
  agendaTimelinePreset,
  agendaMinimalPreset,
] as const;
