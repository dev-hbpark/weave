// Tooltip describer for `canvas-design` frames.

import type { TooltipCapability } from "./types.js";

export const canvasDesignTooltipCapability: TooltipCapability<"canvas-design"> = {
  targetKind: "canvas-design",
  describe: (item, ctx) => {
    const summary =
      item.attrs.summary.length > 0 ? item.attrs.summary : "캔버스";
    const shapeCount = item.attrs.shapes.length;
    const shapeNote =
      shapeCount === 0 ? "도형 없음" : `도형 ${shapeCount}개`;
    if (ctx.entered) {
      return {
        context: `${summary} · ${shapeNote} (진입됨)`,
        actions: [
          { action: "Esc 로 프레임 나가기" },
          { action: "도형 클릭 → 개별 선택" },
        ],
      };
    }
    if (ctx.selected) {
      return {
        context: `${summary} · ${shapeNote} (선택됨)`,
        actions: [
          { action: "더블클릭하여 진입 → 도형 편집" },
          { action: "핸들 드래그로 이동·리사이즈·회전" },
          { action: "Backspace 로 삭제" },
        ],
      };
    }
    return {
      context: `${summary} · ${shapeNote}`,
      actions: [
        { action: "클릭하여 선택" },
        { action: "더블클릭하여 도형 편집 모드" },
      ],
    };
  },
};
