// WI-017 Phase D — InsertableCapability for the root design canvas.
//
// User spec maps aspect buckets to "AI-style" recommendations. Each
// recommendation maps to one primitive DomainKind:
//
//   wide  (≥ 1.6) — frame banner > image (banner photo) > text (long header)
//   tall  (≤ 0.6) — text (long-form column) > frame (column container)
//   square        — frame (card) > image (square photo) > text (paragraph)
//
// WI-032 Phase 3 — the legacy 4 domains (slide/canvas-design/block-doc/
// media) collapsed into the single `frame` container; the wide/square
// "slide" / "canvas" recommendations are now "frame" with the same drag
// rectangle. Drop a preset inside the frame after-the-fact via the
// preset picker.

import { createElement } from "react";
import type { DomainKind } from "../types.js";
import type { InsertableCapability, InsertableRecommendation } from "./types.js";

const KIND_MAP: Record<string, DomainKind> = {
  "wide-frame": "frame",
  "wide-image": "image",
  "wide-text": "text",
  "tall-text": "text",
  "tall-frame": "frame",
  "square-frame": "frame",
  "square-image": "image",
  "square-text": "text",
};

const KIND_GLYPHS: Record<DomainKind, string> = {
  frame: "▢",
  image: "◉",
  video: "▶",
  shape: "▲",
  text: "T",
};

export const designRootInsertable: InsertableCapability<"design"> = {
  containerKind: "design",

  recommend: (rect): ReadonlyArray<InsertableRecommendation> => {
    switch (rect.bucket) {
      case "wide":
        return [
          {
            id: "wide-frame",
            label: "와이드 프레임",
            description: "큰 배너용 컨테이너 — 안에 자유 배치",
            icon: KIND_GLYPHS.frame,
            priority: 1,
          },
          {
            id: "wide-image",
            label: "와이드 이미지",
            description: "넓은 사진 / 일러스트",
            icon: KIND_GLYPHS.image,
            priority: 2,
          },
          {
            id: "wide-text",
            label: "와이드 텍스트",
            description: "긴 헤드라인 / 인용",
            icon: KIND_GLYPHS.text,
            priority: 3,
          },
        ];
      case "tall":
        return [
          {
            id: "tall-text",
            label: "세로 텍스트",
            description: "긴 본문 — 한 컬럼",
            icon: KIND_GLYPHS.text,
            priority: 1,
          },
          {
            id: "tall-frame",
            label: "세로 프레임",
            description: "세로 컨테이너 — 안에 자유 배치",
            icon: KIND_GLYPHS.frame,
            priority: 2,
          },
        ];
      case "square":
        return [
          {
            id: "square-frame",
            label: "정사각 프레임",
            description: "카드 컨테이너",
            icon: KIND_GLYPHS.frame,
            priority: 1,
          },
          {
            id: "square-image",
            label: "정사각 이미지",
            description: "사진 / 일러스트",
            icon: KIND_GLYPHS.image,
            priority: 2,
          },
          {
            id: "square-text",
            label: "정사각 텍스트",
            description: "단락 텍스트",
            icon: KIND_GLYPHS.text,
            priority: 3,
          },
        ];
    }
  },

  /**
   * Skeleton silhouettes are intentionally low-fidelity — a few token-colored
   * strokes evoking the kind's typical shape. The aim is "this is roughly
   * what will appear here," not pixel-perfect preview.
   */
  renderSkeleton: (rec) => {
    const kind = KIND_MAP[rec.id];
    if (kind === undefined) return null;
    return createElement(KindSkeleton, { kind });
  },

  commit: (rec, rect, ctx) => {
    const kind = KIND_MAP[rec.id];
    if (kind === undefined) return;
    ctx.editor.exec("weave.item.add", {
      kind,
      containerId: ctx.containerId,
      frame: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: 0,
      },
    });
  },

  describeHover: () => ({
    title: "프레임 추가",
    hint: "드래그 — 새 프레임. ⌥ 드래그 — 위에 겹쳐 추가.",
    kinds: [
      { id: "frame", label: "프레임", icon: KIND_GLYPHS.frame },
      { id: "text", label: "텍스트", icon: KIND_GLYPHS.text },
      { id: "image", label: "이미지", icon: KIND_GLYPHS.image },
      { id: "shape", label: "도형", icon: KIND_GLYPHS.shape },
    ],
  }),
};

interface KindSkeletonProps {
  readonly kind: DomainKind;
}

/** Inline skeleton — token-only, no domain renderer (cheap to render on hover). */
function KindSkeleton({ kind }: KindSkeletonProps) {
  return createElement(
    "div",
    {
      "data-testid": `insertable-skeleton-${kind}`,
      style: { position: "absolute", inset: 8, opacity: 0.65 },
      className: "flex flex-col gap-1.5",
    },
    [
      createElement("div", {
        key: "h",
        style: { height: 8, width: "55%" },
        className: "rounded-[var(--radius-sm)] bg-[color:var(--accent)]",
      }),
      createElement("div", {
        key: "b1",
        style: { height: 5, width: "90%" },
        className: "rounded-[var(--radius-sm)] bg-[color:var(--text-soft)]",
      }),
      createElement("div", {
        key: "b2",
        style: { height: 5, width: "80%" },
        className: "rounded-[var(--radius-sm)] bg-[color:var(--text-soft)]",
      }),
      createElement("div", {
        key: "b3",
        style: { height: 5, width: "60%" },
        className: "rounded-[var(--radius-sm)] bg-[color:var(--text-soft)]",
      }),
    ],
  );
}
