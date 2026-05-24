// Tooltip describer for `media` frames.

import type { TooltipCapability } from "./types.js";

export const mediaTooltipCapability: TooltipCapability<"media"> = {
  targetKind: "media",
  describe: (item, ctx) => {
    const caption =
      item.attrs.caption.length > 0 ? item.attrs.caption : "미디어";
    const toneLabel = item.attrs.tone === "video" ? "동영상" : "이미지";
    const context = `${caption} · ${toneLabel}`;
    if (ctx.entered) {
      return {
        context,
        actions: [{ action: "나가기 — Esc" }],
      };
    }
    if (ctx.selected) {
      return {
        context,
        actions: [
          { action: "교체 — 더블클릭" },
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
        { action: "교체 — 더블클릭" },
        { action: "위에 추가 — ⌥ 드래그" },
      ],
    };
  },
};
