// DR-design-015 — text kind in Tier-2 layout.
//
// Quick: Bold / Italic / Underline toggles + Color swatch (the four most-
// frequent text edits). More: Family · Size · Align · V-Align · Mode ·
// Decoration · Case · Background · Line height · Letter spacing · Truncate ·
// Max lines · Hyperlink · Opacity. Each field is a labeled row inside the
// More popover.

import type {
  TextAlign,
  TextAlignVertical,
  TextCase,
  TextDecoration,
  TextStyle,
  TextTruncation,
  TextWeight,
} from "@agocraft/core";
// weave-extended TextAttrs (adds `textOverflow`) — not the agocraft re-export.
import type { TextAttrs } from "../../types.js";
import {
  Accordion,
  AccordionItem,
  AlignmentPad,
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconBold,
  IconButton,
  IconClose,
  IconItalic,
  IconText,
  IconUnderline,
  NumberSlider,
  SegmentedControl,
  Switch,
  Tooltip,
} from "@weave/design-system";
import { useState } from "react";
import { TextOnboardingHint } from "../../../launch/TextOnboardingHint.js";
import { fontSizeTooltipCopy } from "../../../launch/text-v1-copy.js";
import {
  deriveTextAutoResize,
  type LegacyTextAutoResize,
  layoutChildFromTextAutoResize,
} from "../../domains/derive-text-auto-resize.js";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  sharedValue,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import { OpacityControl } from "./shadow-controls.js";
import type { ToolbarSectionComponent } from "./types.js";

/** Curated font-family presets. */
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
  // Phase 2 (fontSizeSpec) — px/% unit toggle. Read the DERIVED kind (a string)
  // and the ratio-as-percent (a number) via sharedValue so equality compares
  // primitives, not object refs (Object.is would flag equal specs as Mixed).
  const fontSizeKind = sharedValue<"px" | "ratio">(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontSizeSpec?.kind ?? "px",
  );
  const sizeMode: "px" | "ratio" = isMixed(fontSizeKind) ? "px" : fontSizeKind;
  const ratioPct = sharedValue<number>(items, (it) => {
    const s = (it.attrs as unknown as TextAttrs).fontSizeSpec;
    return s?.kind === "ratio" ? Math.round(s.value * 1000) / 10 : 5;
  });
  const fontWeight = sharedValue<TextWeight>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontWeight,
  );
  const fontStyle = sharedValue<TextStyle>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontStyle,
  );
  const color = useResolveSharedColor(items, (it) => (it.attrs as unknown as TextAttrs).color);
  const background = useResolveSharedColor(
    items,
    (it) => (it.attrs as unknown as TextAttrs).background,
  );
  const textAlign = sharedValue<TextAlign>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAlign,
  );
  // WI-019 B4 / T3 Modify — the legacy `textAutoResize` field is gone in
  // agocraft v10. The 3-mode SegmentedControl below stays in v1 (familiar
  // UX) but reads / writes through `attrs.layoutChild` via the canonical
  // mapping in derive-text-auto-resize.ts. A full 4×4 anchor picker
  // (WI019_LAYOUT_ENABLED) lands as a follow-up PR.
  const textAutoResize = sharedValue<LegacyTextAutoResize>(items, (it) =>
    deriveTextAutoResize((it.attrs as unknown as TextAttrs).layoutChild),
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
  // Overflow is user-selectable in every mode. When `textOverflow` is unset we
  // show the legacy mode-derived default (Fixed clips → HIDDEN, Auto spills →
  // VISIBLE), so the toggle reflects the effective behaviour.
  const textOverflow = sharedValue<"VISIBLE" | "HIDDEN">(items, (it) => {
    const attrs = it.attrs as unknown as TextAttrs;
    if (attrs.textOverflow !== undefined) return attrs.textOverflow;
    return deriveTextAutoResize(attrs.layoutChild) === "NONE" ? "HIDDEN" : "VISIBLE";
  });
  const isOverflowHidden = !isMixed(textOverflow) && textOverflow === "HIDDEN";
  // Ellipsis truncation only applies when content is clipped.
  const isTruncateEnding =
    isOverflowHidden && !isMixed(textTruncation) && textTruncation === "ENDING";
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const linkValue = linkDraft ?? (isMixed(hyperlink) ? "" : hyperlink);
  const bgHasValue = !isMixed(background) && background !== undefined;

  // Quick toggle helpers. `!isMixed(x) && x === ...` is the toggled state;
  // when mixed, the toggle reads as off and clicking sets the asserted
  // value for every selected item.
  const isBold = !isMixed(fontWeight) && fontWeight === "bold";
  const isItalic = !isMixed(fontStyle) && fontStyle === "italic";
  const isUnderline = !isMixed(textDecoration) && textDecoration === "UNDERLINE";

  return (
    <>
      <Bar.Kind icon={<IconText size={18} />} label="Text" />
      <Bar.Quick>
        <IconButton
          aria-label="굵게"
          aria-pressed={isMixed(fontWeight) ? "mixed" : isBold}
          data-tip="굵게"
          data-tip-kbd="⌘ B"
          size="sm"
          data-testid="text-quick-bold"
          onClick={() =>
            updateAll(editor, ids, (prev) => ({
              attrs: {
                ...prev.attrs,
                fontWeight: (isBold ? "normal" : "bold") as TextWeight,
              },
            }))
          }
        >
          <IconBold size={16} />
        </IconButton>
        <IconButton
          aria-label="기울임"
          aria-pressed={isMixed(fontStyle) ? "mixed" : isItalic}
          data-tip="기울임"
          data-tip-kbd="⌘ I"
          size="sm"
          data-testid="text-quick-italic"
          onClick={() =>
            updateAll(editor, ids, (prev) => ({
              attrs: {
                ...prev.attrs,
                fontStyle: (isItalic ? "normal" : "italic") as TextStyle,
              },
            }))
          }
        >
          <IconItalic size={16} />
        </IconButton>
        <IconButton
          aria-label="밑줄"
          aria-pressed={isMixed(textDecoration) ? "mixed" : isUnderline}
          data-tip="밑줄"
          data-tip-kbd="⌘ U"
          size="sm"
          data-testid="text-quick-underline"
          onClick={() =>
            updateAll(editor, ids, (prev) => ({
              attrs: {
                ...prev.attrs,
                textDecoration: (isUnderline ? "NONE" : "UNDERLINE") as TextDecoration,
              },
            }))
          }
        >
          <IconUnderline size={16} />
        </IconButton>
        <ColorPicker
          aria-label="글자 색상"
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
      </Bar.Quick>
      <Bar.More>
        <Accordion>
          <AccordionItem label="타이포" defaultOpen data-testid="text-typo-group">
            <Bar.Field label="Family">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="md"
                    data-testid="text-font-family-trigger"
                    style={{ fontFamily: isMixed(fontFamily) ? undefined : fontFamily }}
                    className="w-full justify-between"
                  >
                    {isMixed(fontFamily) ? "여러 폰트" : fontFamilyLabel(fontFamily)}
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
            </Bar.Field>
            <Bar.Field label="Size">
              {(() => {
                const tip = fontSizeTooltipCopy();
                return (
                  <Tooltip content={tip.content} disabled={tip.disabled} side="bottom">
                    <div data-testid="text-size-section" className="flex w-full flex-col gap-2">
                      {/* px / % unit toggle. % = ratio of the parent frame
                          height (root = design height); the renderer resolves
                          it via resolveFontSize. */}
                      <SegmentedControl<"px" | "ratio">
                        value={sizeMode}
                        onValueChange={(mode) =>
                          updateAll(editor, ids, (prev) => {
                            const prevAttrs = prev.attrs as unknown as TextAttrs;
                            if (mode === "px") {
                              const px = prevAttrs.fontSize ?? 24;
                              return {
                                attrs: {
                                  ...prev.attrs,
                                  fontSize: px,
                                  fontSizeSpec: { kind: "px", value: px },
                                },
                              };
                            }
                            // → ratio: keep an existing ratio, else seed 5%.
                            const value =
                              prevAttrs.fontSizeSpec?.kind === "ratio"
                                ? prevAttrs.fontSizeSpec.value
                                : 0.05;
                            return {
                              attrs: { ...prev.attrs, fontSizeSpec: { kind: "ratio", value } },
                            };
                          })
                        }
                        options={[
                          { value: "px", label: "px" },
                          { value: "ratio", label: "%" },
                        ]}
                        aria-label="Font size unit"
                      />
                      {sizeMode === "px" ? (
                        <NumberSlider
                          value={isMixed(fontSize) ? 24 : fontSize}
                          onValueChange={(v) =>
                            updateAll(editor, ids, (prev) => ({
                              attrs: {
                                ...prev.attrs,
                                fontSize: v,
                                fontSizeSpec: { kind: "px", value: v },
                              },
                            }))
                          }
                          min={8}
                          max={200}
                          step={1}
                          format={(v) => `${Math.round(v)}px`}
                          aria-label="Font size"
                          className="w-full"
                        />
                      ) : (
                        <NumberSlider
                          value={isMixed(ratioPct) ? 5 : ratioPct}
                          onValueChange={(pct) =>
                            updateAll(editor, ids, (prev) => ({
                              attrs: {
                                ...prev.attrs,
                                fontSizeSpec: { kind: "ratio", value: pct / 100 },
                              },
                            }))
                          }
                          min={1}
                          max={40}
                          step={0.5}
                          format={(v) => `${v}%`}
                          aria-label="Font size (% of parent height)"
                          className="w-full"
                        />
                      )}
                    </div>
                  </Tooltip>
                );
              })()}
              <MixedBadge visible={isMixed(fontSize) || isMixed(fontSizeKind)} />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="정렬" data-testid="text-align-group">
            <Bar.Field label="정렬">
              {/* 2D align pad — horizontal (left/center/right) × vertical
                  (top/center/bottom). "양쪽 맞춤"(justify) is a 4th horizontal
                  mode handled by the toggle beside the pad. */}
              <div className="flex items-start gap-3">
                <AlignmentPad<"left" | "center" | "right", TextAlignVertical>
                  horizontal={isMixed(textAlign) ? "" : textAlign}
                  vertical={isMixed(textAlignVertical) ? "" : textAlignVertical}
                  hValues={["left", "center", "right"]}
                  vValues={["TOP", "CENTER", "BOTTOM"]}
                  onChange={(h, v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: {
                        ...prev.attrs,
                        textAlign: h,
                        textAlignHorizontal:
                          h === "left" ? "LEFT" : h === "center" ? "CENTER" : "RIGHT",
                        textAlignVertical: v,
                      },
                    }))
                  }
                  aria-label="텍스트 정렬"
                  data-testid="text-align-pad"
                />
                <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                  <Switch
                    checked={!isMixed(textAlign) && textAlign === "justify"}
                    onCheckedChange={(on) =>
                      updateAll(editor, ids, (prev) => ({
                        attrs: {
                          ...prev.attrs,
                          textAlign: on ? "justify" : "left",
                          textAlignHorizontal: on ? "JUSTIFIED" : "LEFT",
                        },
                      }))
                    }
                    aria-label="양쪽 맞춤"
                  />
                  양쪽 맞춤
                </span>
                <MixedBadge visible={isMixed(textAlign) || isMixed(textAlignVertical)} />
              </div>
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="스타일" data-testid="text-style-group">
            <Bar.Field label="Mode">
              <TextOnboardingHint
                anchor={
                  <div data-testid="text-mode-toggle">
                    <SegmentedControl<LegacyTextAutoResize>
                      value={isMixed(textAutoResize) ? "HEIGHT" : textAutoResize}
                      onValueChange={(v) =>
                        updateAll(editor, ids, (prev) => ({
                          attrs: {
                            ...prev.attrs,
                            // WI-019 B4 — write through layoutChild instead of
                            // the removed textAutoResize field. The legacy 3-
                            // mode UX is preserved via canonical mapping.
                            layoutChild: layoutChildFromTextAutoResize(v),
                          },
                        }))
                      }
                      options={[
                        { value: "WIDTH_AND_HEIGHT", label: "자동너비" },
                        { value: "HEIGHT", label: "자동높이" },
                        { value: "NONE", label: "고정" },
                      ]}
                      aria-label="Text resize mode"
                    />
                  </div>
                }
              />
              <MixedBadge visible={isMixed(textAutoResize)} />
            </Bar.Field>
            <Bar.Field label="Decoration">
              <SegmentedControl<TextDecoration>
                value={isMixed(textDecoration) ? "NONE" : textDecoration}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textDecoration: v },
                  }))
                }
                options={[
                  { value: "NONE", label: "없음" },
                  { value: "UNDERLINE", label: "밑줄" },
                  { value: "STRIKETHROUGH", label: "취소" },
                ]}
                aria-label="Text decoration"
              />
              <MixedBadge visible={isMixed(textDecoration)} />
            </Bar.Field>
            <Bar.Field label="Case">
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
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="배경·간격" data-testid="text-spacing-group">
            <Bar.Field label="Background">
              <div className="flex items-center gap-1.5">
                <ColorPicker
                  aria-label="텍스트 배경"
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
                    data-tip="배경 비우기 (투명)"
                  >
                    <IconClose size={14} />
                  </Button>
                ) : null}
              </div>
            </Bar.Field>
            <Bar.Field label="Line height">
              <NumberSlider
                value={isMixed(lineHeight) ? 1.4 : lineHeight}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: {
                      ...prev.attrs,
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
                className="w-full"
              />
              <MixedBadge visible={isMixed(lineHeight)} />
            </Bar.Field>
            <Bar.Field label="Letter spacing">
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
                className="w-full"
              />
              <MixedBadge visible={isMixed(letterSpacing)} />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="넘침" data-testid="text-wrap-group">
            <Bar.Field label="Overflow">
              <SegmentedControl<"VISIBLE" | "HIDDEN">
                value={isMixed(textOverflow) ? "VISIBLE" : textOverflow}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textOverflow: v },
                  }))
                }
                options={[
                  { value: "VISIBLE", label: "표시" },
                  { value: "HIDDEN", label: "숨김" },
                ]}
                aria-label="Text overflow"
              />
              <MixedBadge visible={isMixed(textOverflow)} />
            </Bar.Field>
            {isOverflowHidden ? (
              <Bar.Field label="Truncate">
                <SegmentedControl<TextTruncation>
                  value={isMixed(textTruncation) ? "DISABLED" : textTruncation}
                  onValueChange={(v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: { ...prev.attrs, textTruncation: v },
                    }))
                  }
                  options={[
                    { value: "DISABLED", label: "Off" },
                    { value: "ENDING", label: "끝줄임" },
                  ]}
                  aria-label="Truncate text"
                />
                <MixedBadge visible={isMixed(textTruncation)} />
              </Bar.Field>
            ) : null}
            {isTruncateEnding ? (
              <Bar.Field label="Max lines">
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
                  className="w-full"
                />
                <MixedBadge visible={isMixed(maxLines)} />
              </Bar.Field>
            ) : null}
          </AccordionItem>
          <AccordionItem label="링크·기타" data-testid="text-link-group">
            <Bar.Field label="Hyperlink">
              <div className="flex items-center gap-1.5 w-full">
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
                  className="flex-1 rounded border border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay-2)] px-2 py-1 text-[12px] text-[color:var(--text-overlay)]"
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
                    data-tip="링크 비우기"
                  >
                    <IconClose size={14} />
                  </Button>
                ) : null}
                <MixedBadge visible={isMixed(hyperlink)} />
              </div>
            </Bar.Field>
            {/* DR-028 — opacity is a decoration unit (was attrs.opacity). */}
            <Bar.Field label="Opacity">
              <OpacityControl editor={editor} ids={ids} />
            </Bar.Field>
          </AccordionItem>
        </Accordion>
      </Bar.More>
    </>
  );
};
