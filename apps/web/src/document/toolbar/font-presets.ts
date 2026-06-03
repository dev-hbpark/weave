// Curated font-family presets, shared by the text toolbar (TextSection) and the
// chart label editor (WI-078 — labels get text-item-level font properties).

export const FONT_FAMILY_PRESETS = [
  {
    value: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    label: "Inter",
  },
  {
    value: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    label: "Noto Sans KR",
  },
  {
    value: "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
    label: "Playfair",
  },
  {
    value: "'Noto Serif KR', 'Source Han Serif K', Georgia, 'Apple SD Gothic Neo', serif",
    label: "Noto Serif KR",
  },
  {
    value: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    label: "JetBrains Mono",
  },
  {
    value: "'Caveat', 'Comic Sans MS', cursive",
    label: "Caveat",
  },
] as const;

/** Friendly label for a font stack (preset name, else the first family). */
export function fontFamilyLabel(stack: string): string {
  const hit = FONT_FAMILY_PRESETS.find((p) => p.value === stack);
  if (hit !== undefined) return hit.label;
  return stack.split(",")[0]?.replace(/['"]/g, "").trim() ?? stack;
}
