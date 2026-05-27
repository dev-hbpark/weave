import type {
  TextAlign,
  TextAlignVertical,
  TextAttrs,
  TextAutoResize,
  TextCase,
  TextDecoration,
  TextStyle,
  TextTruncation,
  TextWeight,
} from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NumberSlider,
  SegmentedControl,
  Tooltip,
} from "@weave/design-system";
import { useState } from "react";
import { TextOnboardingHint } from "../../../launch/TextOnboardingHint.js";
import { fontSizeTooltipCopy } from "../../../launch/text-v1-copy.js";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  sharedValue,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

/** Curated font-family presets. The webfonts are loaded from Google Fonts
 *  in `apps/web/index.html`; each stack ends with a robust fallback so
 *  text renders even if the named family hasn't downloaded yet. */
const FONT_FAMILY_PRESETS = [
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

function fontFamilyLabel(stack: string): string {
  const hit = FONT_FAMILY_PRESETS.find((p) => p.value === stack);
  if (hit !== undefined) return hit.label;
  const first = stack.split(",")[0]?.replace(/['"]/g, "").trim() ?? stack;
  return first;
}

export const TextSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  const fontFamily = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontFamily,
  );
  const fontSize = sharedValue<number>(items, (it) => (it.attrs as unknown as TextAttrs).fontSize);
  const fontWeight = sharedValue<TextWeight>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontWeight,
  );
  const fontStyle = sharedValue<TextStyle>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontStyle,
  );
  // WI-040 — color / background may be a `StyleRef` after a theme swatch
  // pick. `useResolveSharedColor` resolves via the cascade walker BEFORE
  // shared-value equality so the picker sees CSS strings and equality
  // detection works on semantic identity rather than object reference.
  const color = useResolveSharedColor(items, (it) => (it.attrs as unknown as TextAttrs).color);
  const background = useResolveSharedColor(
    items,
    (it) => (it.attrs as unknown as TextAttrs).background,
  );
  const textAlign = sharedValue<TextAlign>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAlign,
  );
  const opacity = sharedValue<number>(items, (it) => (it.attrs as unknown as TextAttrs).opacity);
  // Phase 1 (WI-029) — Figma-equivalent additive fields
  const textAutoResize = sharedValue<TextAutoResize>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAutoResize ?? "HEIGHT",
  );
  const textAlignVertical = sharedValue<TextAlignVertical>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAlignVertical ?? "TOP",
  );
  const textDecoration = sharedValue<TextDecoration>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textDecoration ?? "NONE",
  );
  const textCase = sharedValue<TextCase>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textCase ?? "ORIGINAL",
  );
  const lineHeight = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).lineHeight,
  );
  const letterSpacing = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).letterSpacing,
  );
  const textTruncation = sharedValue<TextTruncation>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textTruncation ?? "DISABLED",
  );
  const maxLines = sharedValue<number | null>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).maxLines ?? null,
  );
  const hyperlink = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).hyperlink?.url ?? "",
  );
  // Mode + truncation gating: Truncate toggle + maxLines only show in Fixed.
  const isFixedMode = !isMixed(textAutoResize) && textAutoResize === "NONE";
  const isTruncateEnding = isFixedMode && !isMixed(textTruncation) && textTruncation === "ENDING";
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const linkValue = linkDraft ?? (isMixed(hyperlink) ? "" : hyperlink);
  const bgHasValue = !isMixed(background) && background !== undefined;
  return (
    <>
      {/* Phase 2 (WI-029 / DR-016) — 3-mode resize toggle.
       *   Auto-W: width grows with content (1 line)
       *   Auto-H: width fixed, height auto-fits (default for new text)
       *   Fixed: width + height both fixed; overflow visible or truncated
       * Mode-specific handles are gated in FrameStage.tsx — Auto-W shows no
       * resize handles, Auto-H shows e/w only, Fixed shows all 8. */}
      <Bar.Section label="Mode" priority={45}>
        <div className="inline-flex items-center">
          {/* WI-029 R5 — wrap the 3-mode toggle in OnboardingCoachmark; the
              first time the user opens this toolbar the hint explains what
              ↔ ↕ □ stand for. One-shot, persists in localStorage. The anchor
              is a wrapper div (not the SegmentedControl directly) because
              chaining two Radix asChild slots — Popover.Trigger → Slot →
              ToggleGroup.Root — corrupts the ref/handler attachment. */}
          <TextOnboardingHint
            anchor={
              <div data-testid="text-mode-toggle">
                <SegmentedControl<TextAutoResize>
                  value={isMixed(textAutoResize) ? "HEIGHT" : textAutoResize}
                  onValueChange={(v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, textAutoResize: v },
                    }))
                  }
                  options={[
                    { value: "WIDTH_AND_HEIGHT", label: "↔" },
                    { value: "HEIGHT", label: "↕" },
                    { value: "NONE", label: "□" },
                  ]}
                  aria-label="Text resize mode"
                />
              </div>
            }
          />
          <MixedBadge visible={isMixed(textAutoResize)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Family" priority={100}>
        <div className="inline-flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="md"
                data-testid="text-font-family-trigger"
                style={{
                  fontFamily: isMixed(fontFamily) ? undefined : fontFamily,
                }}
              >
                {isMixed(fontFamily) ? "여러 폰트" : fontFamilyLabel(fontFamily)}
                &nbsp;▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6}>
              {FONT_FAMILY_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onSelect={() =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, fontFamily: p.value },
                    }))
                  }
                  data-testid={`text-font-family-${p.label.replace(/\s+/g, "-")}`}
                >
                  <span style={{ fontFamily: p.value }}>{p.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <MixedBadge visible={isMixed(fontFamily)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Font" priority={95}>
        <div className="inline-flex items-center gap-1.5">
          <SegmentedControl<TextWeight>
            value={isMixed(fontWeight) ? "normal" : fontWeight}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fontWeight: v },
              }))
            }
            options={[
              { value: "normal", label: "R" },
              { value: "bold", label: "B" },
            ]}
            aria-label="Font weight"
          />
          <SegmentedControl<TextStyle>
            value={isMixed(fontStyle) ? "normal" : fontStyle}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, fontStyle: v },
              }))
            }
            options={[
              { value: "normal", label: "—" },
              { value: "italic", label: "I" },
            ]}
            aria-label="Font style"
          />
          <MixedBadge visible={isMixed(fontWeight) || isMixed(fontStyle)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Size" priority={90}>
        <div className="inline-flex items-center" data-testid="text-size-section">
          {/* WI-029 R5 — fontSize tooltip is visible for 1 week post-launch
              (LG-001 / RISK-001 #6). After the retract date the copy module
              returns `disabled=true` and the Tooltip falls silent. */}
          {(() => {
            const tip = fontSizeTooltipCopy();
            return (
              <Tooltip content={tip.content} disabled={tip.disabled} side="bottom">
                <NumberSlider
                  value={isMixed(fontSize) ? 24 : fontSize}
                  onValueChange={(v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, fontSize: v },
                    }))
                  }
                  min={8}
                  max={200}
                  step={1}
                  format={(v) => `${Math.round(v)}px`}
                  aria-label="Font size"
                />
              </Tooltip>
            );
          })()}
          <MixedBadge visible={isMixed(fontSize)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Align" priority={85}>
        <div className="inline-flex items-center">
          <SegmentedControl<TextAlign>
            value={isMixed(textAlign) ? "left" : textAlign}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: {
                  ...prev.attrs,
                  // WI-029 follow-up — write BOTH the canonical
                  // Phase 1.5 UPPERCASE field AND the legacy lowercase
                  // alias. TextBlock reads `textAlignHorizontal` first
                  // and falls back to `textAlign`; new docs are seeded
                  // with the UPPERCASE value set to "LEFT" so updating
                  // only the lowercase field had no visible effect.
                  textAlign: v,
                  textAlignHorizontal:
                    v === "left"
                      ? "LEFT"
                      : v === "center"
                        ? "CENTER"
                        : v === "right"
                          ? "RIGHT"
                          : "JUSTIFIED",
                },
              }))
            }
            options={[
              { value: "left", label: "L" },
              { value: "center", label: "C" },
              { value: "right", label: "R" },
              { value: "justify", label: "J" },
            ]}
            aria-label="Text align"
          />
          <MixedBadge visible={isMixed(textAlign)} />
        </div>
      </Bar.Section>
      {/* Phase 1 (WI-029) — vertical alignment */}
      <Bar.Section label="V-Align" priority={40}>
        <div className="inline-flex items-center">
          <SegmentedControl<TextAlignVertical>
            value={isMixed(textAlignVertical) ? "TOP" : textAlignVertical}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, textAlignVertical: v },
              }))
            }
            options={[
              { value: "TOP", label: "⤒" },
              { value: "CENTER", label: "⤬" },
              { value: "BOTTOM", label: "⤓" },
            ]}
            aria-label="Vertical align"
          />
          <MixedBadge visible={isMixed(textAlignVertical)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      {/* Phase 1 (WI-029) — decoration + text case */}
      <Bar.Section label="Decoration" priority={45}>
        <div className="inline-flex items-center gap-1.5">
          <SegmentedControl<TextDecoration>
            value={isMixed(textDecoration) ? "NONE" : textDecoration}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, textDecoration: v },
              }))
            }
            options={[
              { value: "NONE", label: "—" },
              { value: "UNDERLINE", label: "U" },
              { value: "STRIKETHROUGH", label: "S" },
            ]}
            aria-label="Text decoration"
          />
          <MixedBadge visible={isMixed(textDecoration)} />
        </div>
      </Bar.Section>
      <Bar.Section label="Case" priority={35}>
        <div className="inline-flex items-center gap-1.5">
          <SegmentedControl<TextCase>
            value={isMixed(textCase) ? "ORIGINAL" : textCase}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, textCase: v },
              }))
            }
            options={[
              { value: "ORIGINAL", label: "Aa" },
              { value: "UPPER", label: "AA" },
              { value: "LOWER", label: "aa" },
              { value: "TITLE", label: "Aa+" },
            ]}
            aria-label="Text case"
          />
          <MixedBadge visible={isMixed(textCase)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Color" priority={80}>
        <div className="inline-flex items-center">
          <ColorPicker
            value={isMixed(color) ? "#cccccc" : (color ?? "#1f2933")}
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, color: pickerValueToStored(v) },
              }))
            }
            onValueChange={() => {
              /* commit-only */
            }}
          />
          <MixedBadge visible={isMixed(color)} />
        </div>
      </Bar.Section>
      <Bar.Section label="Background" priority={50}>
        <div className="inline-flex items-center gap-1.5">
          <ColorPicker
            value={isMixed(background) ? "#cccccc" : (background ?? "#ffffff")}
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, background: pickerValueToStored(v) },
              }))
            }
            onValueChange={() => {
              /* commit-only */
            }}
          />
          <MixedBadge visible={isMixed(background)} />
          {bgHasValue ? (
            <Button
              variant="subtle"
              size="md"
              onClick={() =>
                updateAll(editor, ids, (prev) => {
                  const next = { ...prev.attrs } as Record<string, unknown>;
                  delete next.background;
                  return {
                    attrs: next as Readonly<Record<string, unknown>>,
                  };
                })
              }
              data-testid="text-bg-clear"
              aria-label="배경 비우기"
              title="배경 비우기 (투명)"
            >
              ×
            </Button>
          ) : null}
        </div>
      </Bar.Section>
      <Bar.Divider />
      {/* Phase 1.5 (WI-029) — line height + letter spacing sliders */}
      <Bar.Section label="Line height" priority={30}>
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(lineHeight) ? 1.4 : lineHeight}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: {
                  ...prev.attrs,
                  // WI-029 follow-up — write BOTH the canonical Phase
                  // 1.5 `lineHeightSpec` AND the legacy `lineHeight`.
                  // TextBlock reads `lineHeightSpec` first and falls
                  // back to `lineHeight`; new docs are seeded with a
                  // multiplier spec so updating only the legacy number
                  // had no visible effect.
                  lineHeight: v,
                  lineHeightSpec: { value: v, unit: "multiplier" },
                },
              }))
            }
            min={0.8}
            max={3}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            aria-label="Line height"
          />
          <MixedBadge visible={isMixed(lineHeight)} />
        </div>
      </Bar.Section>
      <Bar.Section label="Letter spacing" priority={25}>
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(letterSpacing) ? 0 : letterSpacing}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, letterSpacing: v },
              }))
            }
            min={-5}
            max={20}
            step={0.5}
            format={(v) => `${v}px`}
            aria-label="Letter spacing"
          />
          <MixedBadge visible={isMixed(letterSpacing)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      {/* Phase 1.5 (WI-029) — Truncate toggle (Fixed mode only) + maxLines */}
      {isFixedMode ? (
        <>
          <Bar.Section label="Truncate" priority={20}>
            <div className="inline-flex items-center">
              <SegmentedControl<TextTruncation>
                value={isMixed(textTruncation) ? "DISABLED" : textTruncation}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textTruncation: v },
                  }))
                }
                options={[
                  { value: "DISABLED", label: "Off" },
                  { value: "ENDING", label: "…" },
                ]}
                aria-label="Truncate text"
              />
              <MixedBadge visible={isMixed(textTruncation)} />
            </div>
          </Bar.Section>
          {isTruncateEnding ? (
            <Bar.Section label="Max lines" priority={20}>
              <div className="inline-flex items-center">
                <NumberSlider
                  value={isMixed(maxLines) || maxLines == null ? 3 : maxLines}
                  onValueChange={(v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, maxLines: Math.max(1, Math.round(v)) },
                    }))
                  }
                  min={1}
                  max={20}
                  step={1}
                  format={(v) => `${Math.round(v)} lines`}
                  aria-label="Max lines"
                />
                <MixedBadge visible={isMixed(maxLines)} />
              </div>
            </Bar.Section>
          ) : null}
          <Bar.Divider />
        </>
      ) : null}
      {/* Phase 1.5 (WI-029) — Hyperlink (box-level, v2 will be per-range) */}
      <Bar.Section label="Hyperlink" priority={25}>
        <div className="inline-flex items-center gap-1.5">
          <input
            type="url"
            value={linkValue}
            placeholder={isMixed(hyperlink) ? "여러 링크" : "https://..."}
            onChange={(e) => setLinkDraft(e.target.value)}
            onBlur={() => {
              if (linkDraft === null) return;
              const trimmed = linkDraft.trim();
              updateAll(editor, ids, (prev) => ({
                attrs: {
                  ...prev.attrs,
                  hyperlink: trimmed.length > 0 ? { url: trimmed } : null,
                },
              }));
              setLinkDraft(null);
            }}
            className="rounded border border-gray-300 px-2 py-1 text-sm w-44"
            data-testid="text-hyperlink-input"
            aria-label="Hyperlink URL"
          />
          {linkValue.length > 0 && !isMixed(hyperlink) ? (
            <Button
              variant="subtle"
              size="md"
              onClick={() => {
                updateAll(editor, ids, (prev) => ({
                  attrs: { ...prev.attrs, hyperlink: null },
                }));
                setLinkDraft(null);
              }}
              data-testid="text-hyperlink-clear"
              aria-label="링크 비우기"
              title="링크 비우기"
            >
              ×
            </Button>
          ) : null}
          <MixedBadge visible={isMixed(hyperlink)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Opacity" priority={45}>
        <div className="inline-flex items-center">
          <NumberSlider
            value={isMixed(opacity) ? 1 : opacity}
            onValueChange={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: { ...prev.attrs, opacity: v },
              }))
            }
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            aria-label="Text opacity"
          />
          <MixedBadge visible={isMixed(opacity)} />
        </div>
      </Bar.Section>
    </>
  );
};
