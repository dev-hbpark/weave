// Tooltip describer for `canvas-design` frames.

import type { TooltipCapability } from "./types.js";

export const canvasDesignTooltipCapability: TooltipCapability<"canvas-design"> = {
  targetKind: "canvas-design",
  describe: (item, ctx) => {
    const summary =
      item.attrs.summary.length > 0 ? item.attrs.summary : "캔버스";
    const shapeCount = item.attrs.shapes.length;
    const context =
      shapeCount === 0 ? summary : `${summary} · 도형 ${shapeCount}`;
    if (ctx.entered) {
      return {
        context,
        actions: [
          { action: "나가기 — Esc" },
          { action: "도형 선택 — 클릭" },
          { action: "도형 추가 — 드래그" },
        ],
      };
    }
    if (ctx.selected) {
      return {
        context,
        actions: [
          { action: "진입 — 더블클릭" },
          { action: "변형 — 핸들 드래그" },
          { action: "삭제 — Delete" },
          { action: "위에 추가 — ⌥ 드래그" },
        ],
      };
    }
    return {
      context,
      actions: [
        { action: "선택 — 클릭" },
        { action: "진입 — 더블클릭" },
        { action: "위에 추가 — ⌥ 드래그" },
      ],
    };
  },
};
