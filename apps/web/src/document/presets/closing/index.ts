// WI-030 — Closing (마무리) category presets. 5 variants for end-of-deck
// slides: thanks / CTA / contact / Q&A / summary.

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

export const closingCategory: PresetCategory = {
  id: "closing",
  label: { ko: "마무리", en: "Closing" },
  description: {
    ko: "데크의 마지막 — 감사, CTA, 연락처, Q&A, 요약",
    en: "Deck closers — thanks, CTA, contact, Q&A, summary",
  },
  order: 5,
};

const SUMMARY_KO = ["첫 번째 요점", "두 번째 요점", "세 번째 요점"] as const;
const SUMMARY_EN = ["First takeaway", "Second takeaway", "Third takeaway"] as const;

// thanks — big "Thank you" + subtitle
const thanksPreset: Preset = {
  id: "closing.thanks",
  categoryId: "closing",
  label: { ko: "마무리 — Thank you", en: "Closing — Thank you" },
  description: { ko: "큰 감사 인사 + 부제.", en: "Big thank-you headline + subtitle." },
  order: 1,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const head = buildTextChild(
      build,
      { x: 0.08, y: 0.36, width: 0.84, height: 0.22, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "감사합니다" : "Thank you",
        fontSize: 80,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const sub = buildTextChild(
      build,
      { x: 0.15, y: 0.62, width: 0.7, height: 0.1, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "질문은 언제든 환영합니다." : "Questions welcome anytime.",
        fontSize: 18,
        color: "var(--text-default)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      head,
      sub,
    ]);
  },
};

// cta — title + CTA button shape + supporting line
const ctaPreset: Preset = {
  id: "closing.cta",
  categoryId: "closing",
  label: { ko: "마무리 — CTA", en: "Closing — CTA" },
  description: { ko: "마무리 + CTA 버튼 형태.", en: "Closing line + CTA-shaped button." },
  order: 2,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const head = buildTextChild(
      build,
      { x: 0.08, y: 0.28, width: 0.84, height: 0.18, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "함께 시작해봐요" : "Let's get started",
        fontSize: 44,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const button = buildShapeChild(
      build,
      { x: 0.34, y: 0.56, width: 0.32, height: 0.12, rotation: 0 },
      "rectangle",
      { fill: paintSolid("var(--accent)") },
    );
    const buttonLabel = buildTextChild(
      build,
      { x: 0.34, y: 0.58, width: 0.32, height: 0.08, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "지금 시작하기" : "Start now",
        fontSize: 18,
        fontWeight: "bold",
        color: "var(--text-on-accent)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const sub = buildTextChild(
      build,
      { x: 0.15, y: 0.74, width: 0.7, height: 0.08, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "이메일로도 자세히 안내드릴게요." : "We'll follow up by email with the details.",
        fontSize: 14,
        color: "var(--text-soft)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      head,
      button,
      buttonLabel,
      sub,
    ]);
  },
};

// contact — title + 3 contact rows (email / web / phone)
const contactPreset: Preset = {
  id: "closing.contact",
  categoryId: "closing",
  label: { ko: "마무리 — 연락처", en: "Closing — Contact" },
  description: { ko: "타이틀 + 이메일·웹·전화 정보.", en: "Title + email, web, phone." },
  order: 3,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const head = buildTextChild(
      build,
      { x: 0.08, y: 0.18, width: 0.84, height: 0.16, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "연락 주세요" : "Get in touch",
        fontSize: 40,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const labels =
      ctx.locale === "ko"
        ? ["이메일", "웹사이트", "전화"]
        : ["Email", "Website", "Phone"];
    const values = ["hello@example.com", "www.example.com", "+82 10 0000 0000"];
    const rows: AgocraftItem[] = [];
    labels.forEach((label, i) => {
      rows.push(
        buildTextChild(
          build,
          { x: 0.08, y: 0.4 + i * 0.14, width: 0.16, height: 0.08, rotation: 0 },
          {
            text: label,
            fontSize: 14,
            fontWeight: "bold",
            color: "var(--text-soft)",
            textAlignHorizontal: "LEFT",
            textAlign: "left",
          },
        ),
        buildTextChild(
          build,
          { x: 0.26, y: 0.4 + i * 0.14, width: 0.66, height: 0.08, rotation: 0 },
          {
            text: values[i] ?? "",
            fontSize: 18,
            color: "var(--text-default)",
            textAlignHorizontal: "LEFT",
            textAlign: "left",
          },
        ),
      );
    });
    return buildFrameRoot(
      build,
      { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      [head, ...rows],
    );
  },
};

// qa — big "Q & A" centered
const qaPreset: Preset = {
  id: "closing.qa",
  categoryId: "closing",
  label: { ko: "마무리 — Q&A", en: "Closing — Q&A" },
  description: { ko: "큰 Q&A 헤딩.", en: "Big Q&A heading." },
  order: 4,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const head = buildTextChild(
      build,
      { x: 0.08, y: 0.34, width: 0.84, height: 0.28, rotation: 0 },
      {
        text: "Q  &  A",
        fontSize: 120,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    const sub = buildTextChild(
      build,
      { x: 0.15, y: 0.68, width: 0.7, height: 0.08, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "궁금한 점을 함께 이야기해요." : "Let's open the floor for questions.",
        fontSize: 18,
        color: "var(--text-soft)",
        textAlignHorizontal: "CENTER",
        textAlign: "center",
      },
    );
    return buildFrameRoot(build, { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 }, [
      head,
      sub,
    ]);
  },
};

// summary — title + 3 takeaway bullets
const summaryPreset: Preset = {
  id: "closing.summary",
  categoryId: "closing",
  label: { ko: "마무리 — 요약", en: "Closing — Summary" },
  description: { ko: "요약 타이틀 + 3개 핵심 메시지.", en: "Summary title + 3 key takeaways." },
  order: 5,
  factory: (ctx) => {
    const build: BuildContext = { newId: ctx.newId, now: ctx.now };
    const head = buildTextChild(
      build,
      { x: 0.08, y: 0.14, width: 0.84, height: 0.14, rotation: 0 },
      {
        text: ctx.locale === "ko" ? "오늘의 요약" : "Today's takeaways",
        fontSize: 32,
        fontWeight: "bold",
        color: "var(--text-strong)",
        textAlignHorizontal: "LEFT",
        textAlign: "left",
      },
    );
    const bullets = (ctx.locale === "ko" ? SUMMARY_KO : SUMMARY_EN).map((text, i) =>
      buildTextChild(
        build,
        { x: 0.1, y: 0.36 + i * 0.16, width: 0.8, height: 0.12, rotation: 0 },
        {
          text: `${i + 1}.  ${text}`,
          fontSize: 22,
          color: "var(--text-default)",
          textAlignHorizontal: "LEFT",
          textAlign: "left",
        },
      ),
    );
    return buildFrameRoot(
      build,
      { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
      [head, ...bullets],
    );
  },
};

export const closingPresets = [
  thanksPreset,
  ctaPreset,
  contactPreset,
  qaPreset,
  summaryPreset,
] as const;
