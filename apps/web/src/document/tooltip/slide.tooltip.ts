// Tooltip describer for `slide` frames.

import type { TooltipCapability } from "./types.js";

export const slideTooltipCapability: TooltipCapability<"slide"> = {
  targetKind: "slide",
  describe: (item, ctx) => {
    const title = item.attrs.title.length > 0 ? item.attrs.title : "슬라이드";
    if (ctx.entered) {
      return {
        context: `${title} (진입됨)`,
        actions: [
          { action: "Esc 로 프레임 나가기" },
          { action: "내부에 새 블록 추가" },
        ],
      };
    }
    if (ctx.selected) {
      return {
        context: `${title} (선택됨)`,
        actions: [
          { action: "더블클릭하여 진입" },
          { action: "핸들 드래그로 이동·리사이즈·회전" },
          { action: "Backspace 로 삭제" },
        ],
      };
    }
    return {
      context: title,
      actions: [
        { action: "클릭하여 선택" },
        { action: "더블클릭하여 진입" },
      ],
    };
  },
};
