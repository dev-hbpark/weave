// WI-017 Phase D — InsertableCapability for `block-doc` frame interior.
//
// `BlockDocAttrs.paragraphs` is `ReadonlyArray<string>` — flat strings,
// no per-paragraph variant in the schema. So the "variant" axis here is
// purely a UX nudge:
//   - wide  → heading-shaped (short, prominent)
//   - tall  → list-shaped (multiple lines)
//   - square → body-shaped (paragraph)
//
// All three commit to the *same* schema operation: append a placeholder
// string to `attrs.paragraphs`. Variant-aware paragraph rendering would
// require a richer schema and lives in a future WI.

import { createElement } from "react";
import type {
  InsertableCapability,
  InsertableRecommendation,
} from "./types.js";

interface ParagraphRecommendationConfig {
  readonly placeholder: string;
  readonly skeletonVariant: "heading" | "list" | "body";
}

const PARAGRAPH_CONFIG: Record<string, ParagraphRecommendationConfig> = {
  "wide-heading": {
    placeholder: "새 헤딩",
    skeletonVariant: "heading",
  },
  "tall-list": {
    placeholder: "목록 항목",
    skeletonVariant: "list",
  },
  "square-body": {
    placeholder: "새 단락",
    skeletonVariant: "body",
  },
};

export const blockDocInsertable: InsertableCapability<"block-doc"> = {
  containerKind: "block-doc",

  recommend: (rect): ReadonlyArray<InsertableRecommendation> => {
    switch (rect.bucket) {
      case "wide":
        return [
          {
            id: "wide-heading",
            label: "헤딩",
            description: "짧고 강조된 헤딩 라인",
            priority: 1,
          },
        ];
      case "tall":
        return [
          {
            id: "tall-list",
            label: "목록",
            description: "여러 줄 글머리 항목",
            priority: 1,
          },
        ];
      case "square":
        return [
          {
            id: "square-body",
            label: "단락",
            description: "본문 단락",
            priority: 1,
          },
        ];
    }
  },

  renderSkeleton: (rec) => {
    const cfg = PARAGRAPH_CONFIG[rec.id];
    if (cfg === undefined) return null;
    return createElement(ParagraphSkeleton, { variant: cfg.skeletonVariant });
  },

  commit: (rec, _rect, ctx) => {
    const cfg = PARAGRAPH_CONFIG[rec.id];
    if (cfg === undefined) return;
    ctx.editor.exec("weave.item.update", {
      itemId: ctx.containerId,
      patch: (it: { attrs: { paragraphs: ReadonlyArray<string> } & Record<string, unknown> }) => ({
        ...it,
        attrs: {
          ...it.attrs,
          paragraphs: [...it.attrs.paragraphs, cfg.placeholder],
        },
      }),
    });
  },

  describeHover: () => ({
    title: "단락 추가",
    hint: "드래그 — 새 단락. ⌥ 드래그 — 위에 겹쳐 추가.",
    kinds: [
      { id: "heading", label: "헤딩" },
      { id: "list", label: "목록" },
      { id: "body", label: "본문" },
    ],
  }),
};

interface ParagraphSkeletonProps {
  readonly variant: "heading" | "list" | "body";
}

function ParagraphSkeleton({ variant }: ParagraphSkeletonProps) {
  if (variant === "heading") {
    return createElement("div", {
      "data-testid": "insertable-skeleton-paragraph-heading",
      style: { position: "absolute", inset: 8, opacity: 0.65 },
      className: "flex flex-col gap-1",
      children: [
        createElement("div", {
          key: "h",
          style: { height: 10, width: "65%" },
          className: "rounded-[var(--radius-sm)] bg-[color:var(--accent)]",
        }),
      ],
    });
  }
  if (variant === "list") {
    return createElement("div", {
      "data-testid": "insertable-skeleton-paragraph-list",
      style: { position: "absolute", inset: 8, opacity: 0.65 },
      className: "flex flex-col gap-1.5",
      children: [0, 1, 2].map((i) =>
        createElement(
          "div",
          { key: i, className: "flex items-center gap-1.5" },
          [
            createElement("div", {
              key: "dot",
              style: { width: 4, height: 4, borderRadius: "50%" },
              className: "bg-[color:var(--accent)] shrink-0",
            }),
            createElement("div", {
              key: "line",
              style: { height: 4, width: `${75 - i * 10}%` },
              className: "rounded-[var(--radius-sm)] bg-[color:var(--text-soft)]",
            }),
          ],
        ),
      ),
    });
  }
  // body
  return createElement("div", {
    "data-testid": "insertable-skeleton-paragraph-body",
    style: { position: "absolute", inset: 8, opacity: 0.65 },
    className: "flex flex-col gap-1",
    children: [0, 1, 2].map((i) =>
      createElement("div", {
        key: i,
        style: { height: 4, width: `${92 - i * 6}%` },
        className: "rounded-[var(--radius-sm)] bg-[color:var(--text-soft)]",
      }),
    ),
  });
}
