// WI-029 R5 — locale-aware short copy for the text-v1 launch comm tooltips.
// Centralized so the tooltip and the banner read from the same string table.
// Source: `docs/launch/TEXT_V1_LAUNCH_NOTE.md` § Tooltip.

type Locale = "ko" | "en";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

// LG-001 + RISK-001 #6: tooltip is visible for 1 week post-launch then
// retracts. Mirrors `TextV1LaunchBanner` so the two surfaces fall silent at
// the same time.
const LAUNCH_AT = Date.parse("2026-06-08T00:00:00Z");
const RETRACT_AT = LAUNCH_AT + 7 * 24 * 60 * 60 * 1000;

const FONT_SIZE_TOOLTIP_COPY: Readonly<Record<Locale, string>> = {
  ko: "글자 크기는 여기서 변경 — 코너 드래그는 박스만 조정합니다 (Figma 방식)",
  en: "Change font size here — corner drag adjusts the box only (Figma style)",
};

export function fontSizeTooltipCopy(): { content: string; disabled: boolean } {
  const now = Date.now();
  const disabled = now < LAUNCH_AT || now > RETRACT_AT;
  const content = FONT_SIZE_TOOLTIP_COPY[detectLocale()];
  return { content, disabled };
}
