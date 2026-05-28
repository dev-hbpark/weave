// WI-017 Phase D / WI-046 — InsertableCapability for the root design canvas.
//
// Option+drag on the empty canvas opens a recommendation popover. As of
// WI-046 it offers exactly THREE choices — a Frame with an Absolute / Flex /
// Grid auto-layout — regardless of the drag rect's aspect ratio.
//
// Rationale (design review): the previous matrix (aspect bucket × kind:
// frame/image/text) plus a SEPARATE Absolute/Flex/Grid toggle was two
// overlapping decision axes in one tiny popover. Dragging out a region is
// fundamentally "make a container here"; the only meaningful follow-up
// question is which layout paradigm that container uses. So the three layout
// paradigms ARE the recommendations — no second toggle, no image/text/shape
// (those are added afterwards via the QuickActionBar "+" inside the frame).

import { createAutoFlexSpec, createAutoGridSpec, type LayoutSpec, trackFr } from "@agocraft/core";
import { IconLayoutAbsolute, IconLayoutFlex, IconLayoutGrid } from "@weave/design-system";
import { createElement, type ReactNode } from "react";
import type { InsertableCapability, InsertableRecommendation } from "./types.js";

type FrameLayoutId = "frame-absolute" | "frame-flex" | "frame-grid";

/** The layout paradigm a recommendation id encodes. `undefined` = Absolute
 *  (no `attrs.layout` — free placement). */
function layoutForRec(id: string): "auto-flex" | "auto-grid" | undefined {
  if (id === "frame-flex") return "auto-flex";
  if (id === "frame-grid") return "auto-grid";
  return undefined; // frame-absolute
}

/** Build the default `LayoutSpec` for the chosen paradigm. */
function pickDefaultLayoutSpec(
  layoutType: "auto-flex" | "auto-grid" | undefined,
): LayoutSpec | undefined {
  if (layoutType === "auto-flex") {
    // Row direction, align START — items keep their own cross size rather than
    // being force-stretched. Users tune via the ContextualToolbar.
    return createAutoFlexSpec({ align: "start" });
  }
  if (layoutType === "auto-grid") {
    // One full-axis column + row (one fr each). Users grow the grid via the
    // ContextualToolbar's GridSizePicker.
    return createAutoGridSpec({ columns: [trackFr(1)], rows: [trackFr(1)] });
  }
  return undefined;
}

const FRAME_LAYOUT_RECS: ReadonlyArray<InsertableRecommendation & { readonly id: FrameLayoutId }> =
  [
    {
      id: "frame-absolute",
      label: "프레임",
      description: "자유 배치 — 자식을 원하는 위치에",
      icon: createElement(IconLayoutAbsolute, { size: 16 }),
      priority: 1,
    },
    {
      id: "frame-flex",
      label: "플렉스",
      description: "한 줄 자동 정렬 (가로·세로)",
      icon: createElement(IconLayoutFlex, { size: 16 }),
      priority: 2,
    },
    {
      id: "frame-grid",
      label: "그리드",
      description: "행·열 격자 배치",
      icon: createElement(IconLayoutGrid, { size: 16 }),
      priority: 3,
    },
  ];

export const designRootInsertable: InsertableCapability<"design"> = {
  containerKind: "design",

  // Plain drag on the root canvas is reserved for marquee multi-selection
  // (Figma parity). Frame creation via drag requires Alt held.
  requireAltKey: true,

  // WI-046 — always the same three layout-paradigm frames; aspect ratio no
  // longer changes the offer (the drag rect's size is honoured on commit).
  recommend: (): ReadonlyArray<InsertableRecommendation> => FRAME_LAYOUT_RECS,

  renderSkeleton: (rec) => createElement(FrameLayoutSkeleton, { layout: layoutForRec(rec.id) }),

  commit: (rec, rect, ctx) => {
    // The picked recommendation encodes the layout paradigm directly.
    const layoutSpec = pickDefaultLayoutSpec(layoutForRec(rec.id));
    ctx.editor.exec("weave.item.add", {
      kind: "frame",
      containerId: ctx.containerId,
      frame: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: 0,
      },
      ...(layoutSpec !== undefined ? { attrsOverride: { layout: layoutSpec } } : {}),
    });
  },

  describeHover: () => ({
    title: "프레임 추가",
    hint: "⌥ + 드래그로 프레임을 만들고 레이아웃을 고르세요",
    kinds: [
      {
        id: "frame-absolute",
        label: "프레임",
        icon: createElement(IconLayoutAbsolute, { size: 16 }),
      },
      { id: "frame-flex", label: "플렉스", icon: createElement(IconLayoutFlex, { size: 16 }) },
      { id: "frame-grid", label: "그리드", icon: createElement(IconLayoutGrid, { size: 16 }) },
    ],
  }),
};

interface FrameLayoutSkeletonProps {
  readonly layout: "auto-flex" | "auto-grid" | undefined;
}

/** Inline skeleton silhouette evoking the chosen layout paradigm — shown in
 *  the persistent guide box while a recommendation is hovered. Token-only,
 *  no domain renderer (cheap to render on hover). */
function FrameLayoutSkeleton({ layout }: FrameLayoutSkeletonProps): ReactNode {
  const cellClass = "rounded-[var(--radius-sm)] bg-[color:var(--accent)]";
  const base = {
    style: { position: "absolute" as const, inset: 8, opacity: 0.6 },
  };

  if (layout === "auto-flex") {
    return createElement(
      "div",
      { "data-testid": "insertable-skeleton-frame-flex", ...base, className: "flex gap-1.5" },
      [0, 1, 2].map((i) => createElement("div", { key: i, className: `flex-1 ${cellClass}` })),
    );
  }

  if (layout === "auto-grid") {
    return createElement(
      "div",
      {
        "data-testid": "insertable-skeleton-frame-grid",
        ...base,
        className: "grid grid-cols-2 grid-rows-2 gap-1.5",
      },
      [0, 1, 2, 3].map((i) => createElement("div", { key: i, className: cellClass })),
    );
  }

  // Absolute — two free-floating rects, no systematic alignment.
  return createElement(
    "div",
    { "data-testid": "insertable-skeleton-frame-absolute", ...base, className: "relative" },
    [
      createElement("div", {
        key: "a",
        style: { position: "absolute", left: "8%", top: "12%", width: "42%", height: "30%" },
        className: cellClass,
      }),
      createElement("div", {
        key: "b",
        style: { position: "absolute", left: "54%", top: "52%", width: "34%", height: "36%" },
        className: cellClass,
      }),
    ],
  );
}
