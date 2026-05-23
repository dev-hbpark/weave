// Tooltip describer for `block-doc` frames.

import type { TooltipCapability } from "./types.js";

export const blockDocTooltipCapability: TooltipCapability<"block-doc"> = {
  targetKind: "block-doc",
  describe: (item, ctx) => {
    const heading =
      item.attrs.heading.length > 0 ? item.attrs.heading : "문서";
    const paragraphCount = item.attrs.paragraphs.length;
    const paragraphNote =
      paragraphCount === 0
        ? "문단 없음"
        : `문단 ${paragraphCount}개`;
    if (ctx.entered) {
      return {
        context: `${heading} · ${paragraphNote} (진입됨)`,
        actions: [
          { action: "Esc 로 프레임 나가기" },
          { action: "문단 클릭하여 인라인 편집" },
        ],
      };
    }
    if (ctx.selected) {
      return {
        context: `${heading} · ${paragraphNote} (선택됨)`,
        actions: [
          { action: "더블클릭하여 진입 → 본문 편집" },
          { action: "핸들 드래그로 이동·리사이즈" },
          { action: "Backspace 로 삭제" },
        ],
      };
    }
    return {
      context: `${heading} · ${paragraphNote}`,
      actions: [
        { action: "클릭하여 선택" },
        { action: "더블클릭하여 본문 편집 모드" },
      ],
    };
  },
};
