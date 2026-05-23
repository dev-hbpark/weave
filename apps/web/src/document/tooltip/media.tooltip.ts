// Tooltip describer for `media` frames.

import type { TooltipCapability } from "./types.js";

export const mediaTooltipCapability: TooltipCapability<"media"> = {
  targetKind: "media",
  describe: (item, ctx) => {
    const caption =
      item.attrs.caption.length > 0 ? item.attrs.caption : "미디어";
    const toneLabel = item.attrs.tone === "video" ? "동영상" : "이미지";
    if (ctx.entered) {
      return {
        context: `${caption} · ${toneLabel} (진입됨)`,
        actions: [{ action: "Esc 로 프레임 나가기" }],
      };
    }
    if (ctx.selected) {
      return {
        context: `${caption} · ${toneLabel} (선택됨)`,
        actions: [
          { action: "더블클릭하여 미디어 교체" },
          { action: "핸들 드래그로 이동·리사이즈" },
          { action: "Backspace 로 삭제" },
        ],
      };
    }
    return {
      context: `${caption} · ${toneLabel}`,
      actions: [
        { action: "클릭하여 선택" },
        { action: "더블클릭하여 미디어 교체" },
      ],
    };
  },
};
