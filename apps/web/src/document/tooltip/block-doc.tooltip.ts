// Tooltip describer for `block-doc` frames.

import type { TooltipCapability } from "./types.js";

export const blockDocTooltipCapability: TooltipCapability<"block-doc"> = {
  targetKind: "block-doc",
  describe: (item, ctx) => {
    const heading =
      item.attrs.heading.length > 0 ? item.attrs.heading : "문서";
    const paragraphCount = item.attrs.paragraphs.length;
    const context =
      paragraphCount === 0 ? heading : `${heading} · 문단 ${paragraphCount}`;
    if (ctx.entered) {
      return {
        context,
        actions: [
          { action: "나가기 — Esc" },
          { action: "문단 편집 — 클릭" },
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
