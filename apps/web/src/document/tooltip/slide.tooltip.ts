// Tooltip describer for `slide` frames.

import type { TooltipCapability } from "./types.js";

export const slideTooltipCapability: TooltipCapability<"slide"> = {
  targetKind: "slide",
  describe: (item, ctx) => {
    const title = item.attrs.title.length > 0 ? item.attrs.title : "슬라이드";
    if (ctx.entered) {
      return {
        context: title,
        actions: [
          { action: "나가기 — Esc" },
          { action: "내부에 추가 — 드래그" },
        ],
      };
    }
    if (ctx.selected) {
      return {
        context: title,
        actions: [
          { action: "진입 — 더블클릭" },
          { action: "변형 — 핸들 드래그" },
          { action: "삭제 — Delete" },
          { action: "위에 추가 — ⌥ 드래그" },
        ],
      };
    }
    return {
      context: title,
      actions: [
        { action: "선택 — 클릭" },
        { action: "진입 — 더블클릭" },
        { action: "위에 추가 — ⌥ 드래그" },
      ],
    };
  },
};
