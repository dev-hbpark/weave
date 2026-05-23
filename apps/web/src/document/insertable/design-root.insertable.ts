// WI-017 Phase D — InsertableCapability for the root design canvas.
//
// User spec maps aspect buckets to "AI-style" recommendations. Here those map
// concretely to the 4 DomainKinds, ordered per bucket:
//
//   wide  (≥ 1.6) — media (wide banner) > canvas-design (wide layout) > slide
//   tall  (≤ 0.6) — block-doc (long form) > slide (vertical bullets)
//   square        — slide (card) > canvas-design (square layout) > block-doc
//
// Adding a new DomainKind to this recommendation tree = add an entry to the
// switch + a kindMap entry. Adding a new ContainerKind = a new
// `*.insertable.ts` file + one register line in `default-registry.ts`.

import { createElement } from "react";
import type { DomainKind } from "../types.js";
import type {
  InsertableCapability,
  InsertableRecommendation,
} from "./types.js";

const KIND_MAP: Record<string, DomainKind> = {
  "wide-media": "media",
  "wide-canvas": "canvas-design",
  "wide-slide": "slide",
  "tall-block-doc": "block-doc",
  "tall-slide": "slide",
  "square-slide": "slide",
  "square-canvas": "canvas-design",
  "square-block-doc": "block-doc",
};

const KIND_GLYPHS: Record<DomainKind, string> = {
  slide: "▭",
  "canvas-design": "◇",
  "block-doc": "≡",
  media: "▤",
};

export const designRootInsertable: InsertableCapability<"design"> = {
  containerKind: "design",

  recommend: (rect): ReadonlyArray<InsertableRecommendation> => {
    switch (rect.bucket) {
      case "wide":
        return [
          {
            id: "wide-media",
            label: "와이드 미디어",
            description: "넓은 이미지·동영상 배너",
            icon: KIND_GLYPHS.media,
            priority: 1,
          },
          {
            id: "wide-canvas",
            label: "가로 캔버스",
            description: "도형으로 구성된 가로 레이아웃",
            icon: KIND_GLYPHS["canvas-design"],
            priority: 2,
          },
          {
            id: "wide-slide",
            label: "가로 슬라이드",
            description: "와이드 타이틀 + 글머리",
            icon: KIND_GLYPHS.slide,
            priority: 3,
          },
        ];
      case "tall":
        return [
          {
            id: "tall-block-doc",
            label: "세로 문서",
            description: "긴 본문에 적합한 텍스트 블록",
            icon: KIND_GLYPHS["block-doc"],
            priority: 1,
          },
          {
            id: "tall-slide",
            label: "세로 슬라이드",
            description: "긴 글머리 목록형 슬라이드",
            icon: KIND_GLYPHS.slide,
            priority: 2,
          },
        ];
      case "square":
        return [
          {
            id: "square-slide",
            label: "기본 슬라이드 카드",
            description: "타이틀 + 핵심 글머리 3개",
            icon: KIND_GLYPHS.slide,
            priority: 1,
          },
          {
            id: "square-canvas",
            label: "정사각 캔버스",
            description: "도형 자유 배치",
            icon: KIND_GLYPHS["canvas-design"],
            priority: 2,
          },
          {
            id: "square-block-doc",
            label: "정사각 문서 블록",
            description: "헤딩 + 단락",
            icon: KIND_GLYPHS["block-doc"],
            priority: 3,
          },
        ];
    }
  },

  /**
   * Skeleton silhouettes are intentionally low-fidelity — a few token-colored
   * strokes evoking the domain's typical shape. The aim is "this is roughly
   * what will appear here," not pixel-perfect preview.
   */
  renderSkeleton: (rec) => {
    const kind = KIND_MAP[rec.id];
    if (kind === undefined) return null;
    return createElement(DomainSkeleton, { kind });
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
    title: "이 캔버스에 프레임 추가",
    hint: "드래그하여 새 도메인 프레임을 만들거나, Option(⌥) 키를 누른 채 드래그하면 아이템 위에서도 새 프레임을 추가할 수 있습니다.",
    kinds: [
      { id: "slide", label: "슬라이드", icon: KIND_GLYPHS.slide },
      { id: "canvas-design", label: "캔버스", icon: KIND_GLYPHS["canvas-design"] },
      { id: "block-doc", label: "문서", icon: KIND_GLYPHS["block-doc"] },
      { id: "media", label: "미디어", icon: KIND_GLYPHS.media },
    ],
  }),
};

interface DomainSkeletonProps {
  readonly kind: DomainKind;
}

/** Inline skeleton — token-only, no domain renderer (cheap to render on hover). */
function DomainSkeleton({ kind }: DomainSkeletonProps) {
  return createElement(
    "div",
    {
      "data-testid": `insertable-skeleton-${kind}`,
      style: { position: "absolute", inset: 8, opacity: 0.65 },
      className: "flex flex-col gap-1.5",
    },
    [
      // Header stripe — token-colored mock title bar.
      createElement("div", {
        key: "h",
        style: { height: 8, width: "55%" },
        className:
          "rounded-[var(--radius-sm)] bg-[color:var(--accent)]",
      }),
      // 3 body lines of decreasing width — universal "content placeholder" look.
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
