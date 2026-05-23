// WI-017 Phase D — InsertableCapability for `canvas-design` frame interior.
//
// The current `CanvasShape` schema is a flat colored rectangle (x/y/w/h/
// rotation/hue) — no "kind" axis (circle / line / arrow not modeled). So
// recommendations here are aspect-shaped variants of *the same* underlying
// rectangle, distinguished by label + hue. Richer shape kinds (circle /
// arrow) need a schema change and live in a future WI.
//
// Commit path: `weave.item.update` with a patcher that appends a new shape
// to `attrs.shapes`. No dedicated `weave.shape.add` command exists yet —
// shape mutations all go through the item-update + shapes-array path.

import { createElement } from "react";
import type {
  InsertableCapability,
  InsertableRecommendation,
} from "./types.js";

interface ShapeRecommendationConfig {
  readonly hue: string;
  readonly skeletonShape: "rect" | "circle" | "line";
}

const SHAPE_CONFIG: Record<string, ShapeRecommendationConfig> = {
  "wide-block": {
    hue: "var(--accent)",
    skeletonShape: "rect",
  },
  "wide-divider": {
    hue: "var(--text-soft)",
    skeletonShape: "line",
  },
  "tall-column": {
    hue: "var(--accent)",
    skeletonShape: "rect",
  },
  "square-tile": {
    hue: "var(--accent)",
    skeletonShape: "rect",
  },
  "square-spot": {
    hue: "var(--accent-soft)",
    skeletonShape: "circle",
  },
};

export const canvasDesignInsertable: InsertableCapability<"canvas-design"> = {
  containerKind: "canvas-design",

  recommend: (rect): ReadonlyArray<InsertableRecommendation> => {
    switch (rect.bucket) {
      case "wide":
        return [
          {
            id: "wide-block",
            label: "가로 블록",
            description: "강조용 액센트 사각형",
            priority: 1,
          },
          {
            id: "wide-divider",
            label: "가로 디바이더",
            description: "얇은 가로 구분선",
            priority: 2,
          },
        ];
      case "tall":
        return [
          {
            id: "tall-column",
            label: "세로 컬럼",
            description: "사이드 강조 컬럼",
            priority: 1,
          },
        ];
      case "square":
        return [
          {
            id: "square-tile",
            label: "타일",
            description: "정사각 액센트 도형",
            priority: 1,
          },
          {
            id: "square-spot",
            label: "스폿",
            description: "은은한 정사각 강조",
            priority: 2,
          },
        ];
    }
  },

  renderSkeleton: (rec) => {
    const cfg = SHAPE_CONFIG[rec.id];
    if (cfg === undefined) return null;
    return createElement(ShapeSkeleton, { cfg });
  },

  commit: (rec, rect, ctx) => {
    const cfg = SHAPE_CONFIG[rec.id];
    if (cfg === undefined) return;
    const newShape = {
      id: `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: 0,
      hue: cfg.hue,
    };
    ctx.editor.exec("weave.item.update", {
      itemId: ctx.containerId,
      patch: (it: { attrs: { shapes: ReadonlyArray<unknown> } & Record<string, unknown> }) => ({
        ...it,
        attrs: {
          ...it.attrs,
          shapes: [...it.attrs.shapes, newShape],
        },
      }),
    });
  },

  describeHover: () => ({
    title: "이 캔버스에 도형 추가",
    hint: "드래그하여 새 도형을 그립니다. Option(⌥) 키를 누른 채 드래그하면 다른 도형 위에서도 새 도형을 그릴 수 있습니다.",
    kinds: [
      { id: "block", label: "블록" },
      { id: "divider", label: "디바이더" },
      { id: "column", label: "컬럼" },
      { id: "spot", label: "스폿" },
    ],
  }),
};

interface ShapeSkeletonProps {
  readonly cfg: ShapeRecommendationConfig;
}

function ShapeSkeleton({ cfg }: ShapeSkeletonProps) {
  if (cfg.skeletonShape === "circle") {
    return createElement("div", {
      "data-testid": "insertable-skeleton-shape-circle",
      style: {
        position: "absolute",
        inset: "10%",
        borderRadius: "50%",
        background: cfg.hue,
        opacity: 0.7,
      },
    });
  }
  if (cfg.skeletonShape === "line") {
    return createElement("div", {
      "data-testid": "insertable-skeleton-shape-line",
      style: {
        position: "absolute",
        left: "8%",
        right: "8%",
        top: "calc(50% - 2px)",
        height: 4,
        borderRadius: "var(--radius-sm)",
        background: cfg.hue,
        opacity: 0.7,
      },
    });
  }
  return createElement("div", {
    "data-testid": "insertable-skeleton-shape-rect",
    style: {
      position: "absolute",
      inset: "8%",
      borderRadius: "var(--radius-sm)",
      background: cfg.hue,
      opacity: 0.7,
    },
  });
}
