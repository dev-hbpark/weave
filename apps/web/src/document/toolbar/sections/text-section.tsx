// DR-design-015 — text kind in Tier-2 layout.
//
// Quick: Bold / Italic / Underline toggles + Color swatch (the four most-
// frequent text edits). More: Family · Size · Align · V-Align · Mode ·
// Decoration · Case · Background · Line height · Letter spacing · Truncate ·
// Max lines · Hyperlink · Opacity. Each field is a labeled row inside the
// More popover.

import type {
  LayoutChildPolicy,
  LayoutSpec,
  PartialTextStyle,
  TextAlign,
  TextAlignVertical,
  TextCase,
  TextDecoration,
  TextRun,
  TextStyle,
  TextTruncation,
  TextWeight,
} from "@agocraft/core";
import { contentAutoAxesFor } from "@agocraft/layout";
import {
  Accordion,
  AccordionItem,
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconAlignBottom,
  IconAlignHorizontalCenter,
  IconAlignLeft,
  IconAlignRight,
  IconAlignTop,
  IconAlignVerticalCenter,
  IconBold,
  IconButton,
  IconClose,
  IconItalic,
  IconText,
  IconUnderline,
  NumberSlider,
  SegmentedControl,
  Tooltip,
} from "@weave/design-system";
import { Fragment, useState } from "react";
import { TextOnboardingHint } from "../../../launch/TextOnboardingHint.js";
import { fontSizeTooltipCopy } from "../../../launch/text-v1-copy.js";
import { EMPTY_READOUT, useActiveTextStyle } from "../../active-text-style.js";
import { absoluteFrameBox, findItemDeep, findParentAndIndex } from "../../agocraft-mirror.js";
import {
  contentAutoAxesToMode,
  deriveTextAutoResize,
  type LegacyTextAutoResize,
  layoutChildForTextResizeMode,
} from "../../domains/derive-text-auto-resize.js";
import { displayFontSizePx, fontSizeAttrsForPx } from "../../domains/text-font-size.js";
import { FONT_GROUPS, FONT_ROLES, fontLabel } from "../../fonts/catalog.js";
import { FontBrowseDialog } from "../../fonts/FontBrowseDialog.js";
import { ensureFontByStack } from "../../fonts/font-loader.js";
import { LAYOUT_FEATURE_ENABLED } from "../../layout/registry.js";
import {
  type DesignDims,
  useDesignDims,
  useDocumentForResolution,
} from "../../style/resolver-context.js";
// weave-extended TextAttrs (adds `textOverflow`) — not the agocraft re-export.
import type { TextAttrs } from "../../types.js";
import {
  batchPerItem,
  isMixed,
  MixedBadge,
  pickerValueToStored,
  sharedValue,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import { OpacityControl } from "./shadow-controls.js";
import type { ToolbarSectionComponent } from "./types.js";

/** A text item's PARENT frame height in design-px — the denominator the
 *  renderer uses to resolve a `fontSizeSpec { kind:"ratio" }` (rendered px =
 *  value × parentHeight). Equals `absoluteFrameBox(item).h / item.frame.height`
 *  (a root child's parent is the design plane → `designHeight`). Falls back to
 *  the design height (root assumption) when the doc/dims context is absent or
 *  the item has no resolvable frame. Used by the px↔% toggle and the % slider
 *  so a unit switch preserves the on-screen size and the legacy `fontSize`
 *  mirror stays correct. */
function parentHeightPxOf(
  doc: ReturnType<typeof useDocumentForResolution>,
  dims: DesignDims | null,
  id: string,
): number {
  if (doc === null || dims === null) return dims?.height ?? 1080;
  const box = absoluteFrameBox(doc, id, dims.width, dims.height);
  const item = findItemDeep(doc, id);
  const fh = (item?.attrs as { frame?: { height?: number } } | undefined)?.frame?.height;
  if (box !== null && fh !== undefined && fh > 0) return box.h / fh;
  return dims.height;
}

/** DR-057 — when a text item is run-driven (`textRuns` present), a whole-box
 *  toolbar toggle must rewrite EVERY run so `textRuns` stays the single source
 *  of truth (the read-only container neutralizes its own inline toggleables, so
 *  setting only the item-level attr would be invisible). Sets the attribute on
 *  each text run, or DELETES it when `value` is undefined — absence is the
 *  neutral/off state the container renders. Paragraph-break runs are untouched. */
function setRunsInlineAttr(
  runs: ReadonlyArray<TextRun>,
  key: "fontWeight" | "fontStyle" | "textDecoration",
  value: string | undefined,
): ReadonlyArray<TextRun> {
  return runs.map((run) => {
    if (run.insert === "\n") return run;
    const attrs = { ...(run.attributes ?? {}) } as Record<string, unknown>;
    if (value === undefined) delete attrs[key];
    else attrs[key] = value;
    return Object.keys(attrs).length > 0
      ? { insert: run.insert, attributes: attrs as unknown as PartialTextStyle }
      : { insert: run.insert };
  });
}

export const TextSection: ToolbarSectionComponent = ({
  editor,
  document: layoutDoc,
  items,
  ids,
}) => {
  // px↔% conversion needs the renderer's parent-height denominator (design-px).
  const doc = useDocumentForResolution();
  const dims = useDesignDims();
  const fontFamily = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).fontFamily,
  );
  // DR-093 — the DISPLAYED px is RESOLVED from the authoritative fontSizeSpec
  // (ratio × parentHeight, or px value), NOT the bare legacy `fontSize` mirror —
  // so the slider number always equals the rendered size, even for a ratio /
  // agent-created text. Rounded so float epsilon across items doesn't read Mixed.
  const resolvedSizePx = sharedValue<number>(items, (it) =>
    Math.round(
      displayFontSizePx(it.attrs as unknown as TextAttrs, parentHeightPxOf(doc, dims, it.id)),
    ),
  );
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
  // DR-059 — text outline (외곽선). Color resolves through the cascade like
  // fill/background; width is design-px (0 / unset = off).
  const outlineColor = useResolveSharedColor(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textOutline?.color,
  );
  const outlineWidth = sharedValue<number>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textOutline?.width ?? 0,
  );
  const textAlign = sharedValue<TextAlign>(
    items,
    (it) => (it.attrs as unknown as TextAttrs).textAlign,
  );
  // WI-019 B4 / T3 Modify — the legacy `textAutoResize` field is gone in
  // agocraft v10. The 3-mode SegmentedControl below stays in v1 (familiar
  // UX) but reads / writes through `attrs.layoutChild`.
  // WI-216 / DR-053 Stage 2 (b): for a LAID-OUT child the mode depends on the
  // parent's flex DIRECTION / grid alignment (e.g. 자동너비 vs 자동높이 differ by
  // which axis is main), which only the engine knows — so read it from
  // `getContentAutoAxes`. Bare-`layoutChild` `deriveTextAutoResize` is the
  // fallback for FREE / absolute text (engine returns managed:false).
  const textAutoResize = sharedValue<LegacyTextAutoResize>(items, (it) => {
    if (LAYOUT_FEATURE_ENABLED) {
      // Resolve the parent from the RELIABLE `document` prop (the same instance the
      // flex/grid child sections use) — NOT useDocumentForResolution, which is
      // null/stale in the toolbar's render slot and made this read fall back to
      // deriveTextAutoResize → flex 자동너비 mislabeled as 자동높이 (WI-216). Then the
      // engine's PURE verdict; read and write now share this exact resolution.
      const parentLayout = (
        findParentAndIndex(layoutDoc, it.id)?.parent.attrs as { layout?: LayoutSpec } | undefined
      )?.layout;
      const axes = contentAutoAxesFor(parentLayout, (it.attrs as unknown as TextAttrs).layoutChild);
      if (axes.managed) return contentAutoAxesToMode(axes);
    }
    return deriveTextAutoResize((it.attrs as unknown as TextAttrs).layoutChild);
  });
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
  // DR-059 — outline is "on" when width > 0. Picking a color while off enables
  // it at a sensible default thickness; clearing / width 0 removes it.
  const outlineWidthValue = isMixed(outlineWidth) ? 0 : outlineWidth;
  const outlineOn = outlineWidthValue > 0;
  const DEFAULT_OUTLINE_WIDTH = 2;
  // DR-062 — when a single text item is being edited, its editor registers a
  // per-range STYLE applier; every routed control then targets the live
  // SELECTION (per-range) instead of the whole item, and DISPLAYS the
  // selection's current style (multi vs single) from the live readout.
  const activeEntry = useActiveTextStyle(ids.length === 1 ? (ids[0] ?? null) : null);
  const activeStyle = activeEntry?.applier ?? null;
  const readout = activeEntry?.readout ?? EMPTY_READOUT;
  const editing = activeStyle !== null;

  // WI-136 — "모든 폰트 찾아보기" (Google Fonts browse) dialog open state.
  const [browseOpen, setBrowseOpen] = useState(false);
  // Set fontFamily to a theme-role var (`var(--font-*)`) or an explicit catalog
  // stack, loading the webfont on demand. Shared by the picker dropdown and the
  // browse dialog. Per-range Lexical style resolves the var/stack identically.
  const applyFontFamily = (value: string) => {
    ensureFontByStack(value);
    if (activeStyle !== null) {
      activeStyle.setStyleProp("fontFamily", value);
      return;
    }
    updateAll(editor, ids, (prev) => ({
      attrs: { ...prev.attrs, fontFamily: value },
    }));
  };

  // Quick toggle helpers. `!isMixed(x) && x === ...` is the toggled state;
  // when mixed, the toggle reads as off and clicking sets the asserted
  // value for every selected item. While editing, the per-range readout's
  // selection format wins so the toggles reflect the SELECTION.
  const isBold = editing ? readout.bold : !isMixed(fontWeight) && fontWeight === "bold";
  const isItalic = editing ? readout.italic : !isMixed(fontStyle) && fontStyle === "italic";
  const isUnderline = editing
    ? readout.underline
    : !isMixed(textDecoration) && textDecoration === "UNDERLINE";

  // DR-062 — per-range display helpers. While editing, a control shows the
  // selection's value: a single value when the sub-range is uniform, the Mixed
  // badge when it spans differing values (Lexical's "" → `mixed`).
  const itemColorStr = isMixed(color) ? "#1f2933" : (color ?? "#1f2933");
  const editColor = editing ? readout.props.color : undefined;
  const editFontSize = editing ? readout.props.fontSize : undefined;
  const editFontFamily = editing ? readout.props.fontFamily : undefined;
  const editLetterSpacing = editing ? readout.props.letterSpacing : undefined;
  const editTextCase = editing ? readout.props.textCase : undefined;
  // The decoration the SELECTION currently carries (꾸밈 segmented control).
  const editDecoration: TextDecoration | undefined = editing
    ? readout.underline
      ? "UNDERLINE"
      : readout.strikethrough
        ? "STRIKETHROUGH"
        : "NONE"
    : undefined;
  /** Normalize the selection's decoration to `target` via format toggles
   *  (a SegmentedControl SETS one of three; Lexical only TOGGLES). */
  const applyRangeDecoration = (target: TextDecoration): void => {
    if (activeStyle === null) return;
    if (target === "UNDERLINE") {
      if (!readout.underline) activeStyle.toggleFormat("underline");
      if (readout.strikethrough) activeStyle.toggleFormat("strikethrough");
    } else if (target === "STRIKETHROUGH") {
      if (!readout.strikethrough) activeStyle.toggleFormat("strikethrough");
      if (readout.underline) activeStyle.toggleFormat("underline");
    } else {
      if (readout.underline) activeStyle.toggleFormat("underline");
      if (readout.strikethrough) activeStyle.toggleFormat("strikethrough");
    }
  };

  return (
    <>
      <Bar.Kind icon={<IconText size={18} />} label="텍스트" />
      <Bar.Quick>
        {/* WI-136 — font family promoted to Quick, BEFORE size: the most common
            typographic choice is now one click away instead of inside More 타이포.
            Compact trigger (label truncates); full role/catalog/browse menu. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="md"
              data-testid="text-font-family-trigger"
              data-tip="글꼴"
              style={{
                fontFamily: editing
                  ? (editFontFamily?.value as string | undefined)
                  : isMixed(fontFamily)
                    ? undefined
                    : fontFamily,
              }}
              className="w-[132px] justify-between gap-1"
            >
              <span className="truncate">
                {editing
                  ? editFontFamily?.mixed
                    ? "여러 폰트"
                    : fontLabel(
                        (editFontFamily?.value as string | undefined) ??
                          (isMixed(fontFamily) ? "" : fontFamily),
                      )
                  : isMixed(fontFamily)
                    ? "여러 폰트"
                    : fontLabel(fontFamily)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="max-h-[60vh] overflow-y-auto"
          >
            <DropdownMenuLabel>테마 역할</DropdownMenuLabel>
            {FONT_ROLES.map((r) => (
              <DropdownMenuItem
                key={r.id}
                onSelect={() => applyFontFamily(r.value)}
                data-testid={`text-font-role-${r.id}`}
              >
                <span style={{ fontFamily: r.value }}>{r.label}</span>
              </DropdownMenuItem>
            ))}
            {FONT_GROUPS.map((g) => (
              <Fragment key={g.category}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                {g.fonts.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onPointerEnter={() => ensureFontByStack(f.stack)}
                    onSelect={() => applyFontFamily(f.stack)}
                    data-testid={`text-font-family-${f.id}`}
                  >
                    <span style={{ fontFamily: f.stack }}>{f.label}</span>
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setBrowseOpen(true)}
              data-testid="text-font-browse-all"
            >
              모든 폰트 찾아보기…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <FontBrowseDialog
          open={browseOpen}
          onOpenChange={setBrowseOpen}
          onPick={(entry) => applyFontFamily(entry.stack)}
        />
        <MixedBadge visible={editing ? !!editFontFamily?.mixed : isMixed(fontFamily)} />
        {/* DR-design-016 — font size promoted to Quick (the most frequent text
            edit after B/I/U); writes px (fine-grained px/% unit toggle stays in
            More 크기). */}
        <NumberSlider
          value={
            editing
              ? editFontSize?.mixed
                ? 24
                : ((editFontSize?.value as number | undefined) ??
                  (isMixed(resolvedSizePx) ? 24 : resolvedSizePx))
              : isMixed(resolvedSizePx)
                ? 24
                : resolvedSizePx
          }
          onValueChange={(v) => {
            if (activeStyle !== null) {
              activeStyle.setStyleProp("fontSize", v, { continuous: true }); // per-range px (slider)
              return;
            }
            // DR-093 — preserve the kind so a ratio (agent / responsive) text
            // stays responsive and a px text stays absolute; the spec is the
            // source of truth, `fontSize` is the synced mirror.
            batchPerItem(editor, ids, (id) =>
              editor.exec("weave.item.update", {
                itemId: id,
                patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
                  attrs: {
                    ...prev.attrs,
                    ...fontSizeAttrsForPx(
                      prev.attrs as unknown as TextAttrs,
                      v,
                      parentHeightPxOf(doc, dims, id),
                    ),
                  },
                }),
              }),
            );
          }}
          min={8}
          max={200}
          step={1}
          format={(v) => `${Math.round(v)}`}
          aria-label="글자 크기"
          className="w-[88px]"
        />
        <IconButton
          aria-label="굵게"
          aria-pressed={isMixed(fontWeight) ? "mixed" : isBold}
          data-tip="굵게"
          data-tip-kbd="⌘ B"
          size="sm"
          data-testid="text-quick-bold"
          onClick={() => {
            if (activeStyle !== null) {
              activeStyle.toggleFormat("bold");
              return;
            }
            updateAll(editor, ids, (prev) => {
              const next = (isBold ? "normal" : "bold") as TextWeight;
              const runs = (prev.attrs as { textRuns?: ReadonlyArray<TextRun> }).textRuns;
              return {
                attrs: {
                  ...prev.attrs,
                  fontWeight: next,
                  ...(runs && runs.length > 0
                    ? {
                        textRuns: setRunsInlineAttr(
                          runs,
                          "fontWeight",
                          next === "bold" ? "bold" : undefined,
                        ),
                      }
                    : {}),
                },
              };
            });
          }}
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
          onClick={() => {
            if (activeStyle !== null) {
              activeStyle.toggleFormat("italic");
              return;
            }
            updateAll(editor, ids, (prev) => {
              const next = (isItalic ? "normal" : "italic") as TextStyle;
              const runs = (prev.attrs as { textRuns?: ReadonlyArray<TextRun> }).textRuns;
              return {
                attrs: {
                  ...prev.attrs,
                  fontStyle: next,
                  ...(runs && runs.length > 0
                    ? {
                        textRuns: setRunsInlineAttr(
                          runs,
                          "fontStyle",
                          next === "italic" ? "italic" : undefined,
                        ),
                      }
                    : {}),
                },
              };
            });
          }}
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
          onClick={() => {
            if (activeStyle !== null) {
              activeStyle.toggleFormat("underline");
              return;
            }
            updateAll(editor, ids, (prev) => {
              const next = (isUnderline ? "NONE" : "UNDERLINE") as TextDecoration;
              const runs = (prev.attrs as { textRuns?: ReadonlyArray<TextRun> }).textRuns;
              return {
                attrs: {
                  ...prev.attrs,
                  textDecoration: next,
                  ...(runs && runs.length > 0
                    ? {
                        textRuns: setRunsInlineAttr(
                          runs,
                          "textDecoration",
                          next === "UNDERLINE" ? "UNDERLINE" : undefined,
                        ),
                      }
                    : {}),
                },
              };
            });
          }}
        >
          <IconUnderline size={16} />
        </IconButton>
        <ColorPicker
          aria-label="글자 색상"
          value={
            editing
              ? editColor?.mixed
                ? "#cccccc"
                : ((editColor?.value as string | undefined) ?? itemColorStr)
              : isMixed(color)
                ? "#cccccc"
                : (color ?? "#1f2933")
          }
          onValueCommit={(v) => {
            if (activeStyle !== null) {
              // Per-range: a literal CSS color (theme tokens don't apply to a
              // Lexical node style); routes to the editor selection.
              activeStyle.setStyleProp("color", v);
              return;
            }
            updateAll(editor, ids, (prev) => ({
              attrs: { ...prev.attrs, color: pickerValueToStored(v) },
            }));
          }}
          onValueChange={() => {
            /* commit-only */
          }}
        />
      </Bar.Quick>
      <Bar.More>
        <Accordion>
          <AccordionItem label="타이포" defaultOpen data-testid="text-typo-group">
            <Bar.Field label="크기">
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
                        // Unit toggle PRESERVES the on-screen size: px→% stores
                        // `currentPx / parentHeight` (not a fixed 5% seed, which
                        // resized/large text to the wrong size), and %→px stores
                        // `ratio × parentHeight`. The legacy `fontSize` px mirror
                        // is written in both directions so it stays the resolved
                        // px for legacy readers / round-trips.
                        onValueChange={(mode) =>
                          batchPerItem(editor, ids, (id) => {
                            const ph = parentHeightPxOf(doc, dims, id);
                            editor.exec("weave.item.update", {
                              itemId: id,
                              patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => {
                                const a = prev.attrs as unknown as TextAttrs;
                                // DR-093 — resolve the CURRENT px from the spec
                                // (source of truth), not the bare fontSize mirror.
                                const curPx = displayFontSizePx(a, ph);
                                if (mode === "px") {
                                  return {
                                    attrs: {
                                      ...prev.attrs,
                                      fontSize: curPx,
                                      fontSizeSpec: { kind: "px", value: curPx },
                                    },
                                  };
                                }
                                // → ratio: current rendered px ÷ parent height.
                                const value = ph > 0 ? curPx / ph : 0.05;
                                return {
                                  attrs: {
                                    ...prev.attrs,
                                    fontSize: curPx,
                                    fontSizeSpec: { kind: "ratio", value },
                                  },
                                };
                              },
                            });
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
                          value={
                            editing
                              ? editFontSize?.mixed
                                ? 24
                                : ((editFontSize?.value as number | undefined) ??
                                  (isMixed(resolvedSizePx) ? 24 : resolvedSizePx))
                              : isMixed(resolvedSizePx)
                                ? 24
                                : resolvedSizePx
                          }
                          onValueChange={(v) => {
                            if (activeStyle !== null) {
                              activeStyle.setStyleProp("fontSize", v, { continuous: true }); // per-range px (slider)
                              return;
                            }
                            // DR-093 — sizeMode is "px" here, so the spec stays px;
                            // fontSizeAttrsForPx keeps the mirror synced.
                            batchPerItem(editor, ids, (id) =>
                              editor.exec("weave.item.update", {
                                itemId: id,
                                patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
                                  attrs: {
                                    ...prev.attrs,
                                    ...fontSizeAttrsForPx(
                                      prev.attrs as unknown as TextAttrs,
                                      v,
                                      parentHeightPxOf(doc, dims, id),
                                    ),
                                  },
                                }),
                              }),
                            );
                          }}
                          min={8}
                          // Expand the scale so a resize-produced size beyond the
                          // normal editing ceiling keeps the thumb in sync with
                          // the number (otherwise the thumb pins at max while the
                          // input shows a larger value, and a nudge snaps it back).
                          max={Math.max(
                            200,
                            Math.ceil(isMixed(resolvedSizePx) ? 24 : resolvedSizePx),
                          )}
                          step={1}
                          format={(v) => `${Math.round(v)}px`}
                          aria-label="Font size"
                          className="w-full"
                        />
                      ) : (
                        <NumberSlider
                          value={isMixed(ratioPct) ? 5 : ratioPct}
                          // Write the legacy `fontSize` px mirror too so px↔%
                          // round-trips and legacy readers stay correct.
                          onValueChange={(pct) =>
                            batchPerItem(editor, ids, (id) => {
                              const ph = parentHeightPxOf(doc, dims, id);
                              editor.exec("weave.item.update", {
                                itemId: id,
                                patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
                                  attrs: {
                                    ...prev.attrs,
                                    fontSize: (pct / 100) * ph,
                                    fontSizeSpec: { kind: "ratio", value: pct / 100 },
                                  },
                                }),
                              });
                            })
                          }
                          min={1}
                          // Same dynamic ceiling as px — a corner-resize can push
                          // the ratio past the normal 40% editing range.
                          max={Math.max(40, Math.ceil(isMixed(ratioPct) ? 5 : ratioPct))}
                          step={0.5}
                          format={(v) => `${Math.round(v * 10) / 10}%`}
                          aria-label="Font size (% of parent height)"
                          className="w-full"
                        />
                      )}
                    </div>
                  </Tooltip>
                );
              })()}
              <MixedBadge
                visible={
                  editing ? !!editFontSize?.mixed : isMixed(resolvedSizePx) || isMixed(fontSizeKind)
                }
              />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="정렬" data-testid="text-align-group">
            {/* DR-design-016 — the wide 2D AlignmentPad + separate justify switch
                replaced by two compact icon SegmentedControls (가로 / 세로). */}
            <Bar.Field label="가로">
              <SegmentedControl<"left" | "center" | "right" | "justify">
                value={isMixed(textAlign) ? "left" : textAlign}
                onValueChange={(h) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: {
                      ...prev.attrs,
                      textAlign: h,
                      textAlignHorizontal:
                        h === "left"
                          ? "LEFT"
                          : h === "center"
                            ? "CENTER"
                            : h === "right"
                              ? "RIGHT"
                              : "JUSTIFIED",
                    },
                  }))
                }
                options={[
                  { value: "left", label: "왼쪽", icon: <IconAlignLeft size={14} /> },
                  {
                    value: "center",
                    label: "가운데",
                    icon: <IconAlignHorizontalCenter size={14} />,
                  },
                  { value: "right", label: "오른쪽", icon: <IconAlignRight size={14} /> },
                  { value: "justify", label: "양쪽" },
                ]}
                aria-label="가로 정렬"
                data-testid="text-align-h"
              />
              <MixedBadge visible={isMixed(textAlign)} />
            </Bar.Field>
            <Bar.Field label="세로">
              <SegmentedControl<TextAlignVertical>
                value={isMixed(textAlignVertical) ? "TOP" : textAlignVertical}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textAlignVertical: v },
                  }))
                }
                options={[
                  { value: "TOP", label: "위", icon: <IconAlignTop size={14} /> },
                  { value: "CENTER", label: "가운데", icon: <IconAlignVerticalCenter size={14} /> },
                  { value: "BOTTOM", label: "아래", icon: <IconAlignBottom size={14} /> },
                ]}
                aria-label="세로 정렬"
                data-testid="text-align-v"
              />
              <MixedBadge visible={isMixed(textAlignVertical)} />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="스타일" data-testid="text-style-group">
            <Bar.Field label="크기 조절">
              <TextOnboardingHint
                anchor={
                  <div data-testid="text-mode-toggle">
                    <SegmentedControl<LegacyTextAutoResize>
                      value={isMixed(textAutoResize) ? "HEIGHT" : textAutoResize}
                      onValueChange={(v) =>
                        // WI-216 / DR-053 Stage 2 (c) — write through layoutChild.
                        // For a LAID-OUT child (auto-flex / grid) keep the layout
                        // policy and toggle only the engine-owned intrinsic size,
                        // so "고정" durably sticks instead of reverting to
                        // "자동높이" on the next resize. Free text falls back to the
                        // legacy absolute-constraints anchor mapping. Per-item so
                        // each child reads its own parent layout + frame.
                        batchPerItem(editor, ids, (id) => {
                          // Reliable `document` prop (same as the read above) so the
                          // write resolves the same parent the read does.
                          const parentLayout = (
                            findParentAndIndex(layoutDoc, id)?.parent.attrs as
                              | { layout?: LayoutSpec }
                              | undefined
                          )?.layout;
                          editor.exec("weave.item.update", {
                            itemId: id,
                            patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => {
                              const a = prev.attrs as {
                                layoutChild?: LayoutChildPolicy;
                                frame?: { width: number; height: number };
                              };
                              return {
                                attrs: {
                                  ...prev.attrs,
                                  layoutChild: layoutChildForTextResizeMode(
                                    v,
                                    a.layoutChild,
                                    parentLayout,
                                    a.frame ?? { width: 0, height: 0 },
                                  ),
                                },
                              };
                            },
                          });
                        })
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
            <Bar.Field label="꾸밈">
              <SegmentedControl<TextDecoration>
                value={
                  editing
                    ? (editDecoration ?? "NONE")
                    : isMixed(textDecoration)
                      ? "NONE"
                      : textDecoration
                }
                onValueChange={(v) => {
                  if (activeStyle !== null) {
                    applyRangeDecoration(v); // per-range via Lexical format toggles
                    return;
                  }
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textDecoration: v },
                  }));
                }}
                options={[
                  { value: "NONE", label: "없음" },
                  { value: "UNDERLINE", label: "밑줄" },
                  { value: "STRIKETHROUGH", label: "취소" },
                ]}
                aria-label="Text decoration"
              />
              <MixedBadge visible={editing ? false : isMixed(textDecoration)} />
            </Bar.Field>
            <Bar.Field label="대소문자">
              <SegmentedControl<TextCase>
                value={
                  editing
                    ? editTextCase?.mixed
                      ? "ORIGINAL"
                      : ((editTextCase?.value as TextCase | undefined) ?? "ORIGINAL")
                    : isMixed(textCase)
                      ? "ORIGINAL"
                      : textCase
                }
                onValueChange={(v) => {
                  if (activeStyle !== null) {
                    // ORIGINAL clears the per-range transform (base applies);
                    // SMALL_CAPS has no plain text-transform → treat as ORIGINAL.
                    activeStyle.setStyleProp(
                      "textCase",
                      v === "ORIGINAL" || v === "SMALL_CAPS" ? undefined : v,
                    );
                    return;
                  }
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textCase: v },
                  }));
                }}
                options={[
                  { value: "ORIGINAL", label: "Aa" },
                  { value: "UPPER", label: "AA" },
                  { value: "LOWER", label: "aa" },
                  { value: "TITLE", label: "Aa+" },
                ]}
                aria-label="Text case"
              />
              <MixedBadge visible={editing ? !!editTextCase?.mixed : isMixed(textCase)} />
            </Bar.Field>
            {/* DR-059 / DR-060 / DR-062 — 외곽선: a thick stroked back layer
                behind the fill. While EDITING a text item, the control targets
                the live SELECTION (per-range) via the active-style bridge and
                DISPLAYS the selection's outline; otherwise it sets the
                WHOLE-ITEM outline (DR-059). */}
            <Bar.Field label="외곽선">
              <div className="flex items-center gap-1.5" data-testid="text-outline-field">
                <ColorPicker
                  aria-label="외곽선 색상"
                  value={
                    editing
                      ? readout.outline.mixed
                        ? "#cccccc"
                        : (readout.outline.color ?? "#000000")
                      : isMixed(outlineColor)
                        ? "#cccccc"
                        : (outlineColor ?? "#000000")
                  }
                  onValueCommit={(v) => {
                    if (activeStyle !== null) {
                      // Per-range: a literal CSS color (theme tokens don't apply
                      // to a Lexical node style); routes to the editor selection.
                      activeStyle.setOutlineColor(v);
                      return;
                    }
                    updateAll(editor, ids, (prev) => {
                      const prevW = (prev.attrs as unknown as TextAttrs).textOutline?.width ?? 0;
                      return {
                        attrs: {
                          ...prev.attrs,
                          textOutline: {
                            color: pickerValueToStored(v),
                            width: prevW > 0 ? prevW : DEFAULT_OUTLINE_WIDTH,
                          },
                        },
                      };
                    });
                  }}
                  onValueChange={() => {
                    /* commit-only */
                  }}
                />
                {outlineOn || editing ? (
                  <Button
                    variant="subtle"
                    size="md"
                    onClick={() => {
                      if (activeStyle !== null) {
                        activeStyle.clearOutline();
                        return;
                      }
                      updateAll(editor, ids, (prev) => {
                        const next = { ...prev.attrs } as Record<string, unknown>;
                        delete next.textOutline;
                        return { attrs: next as Readonly<Record<string, unknown>> };
                      });
                    }}
                    data-testid="text-outline-clear"
                    aria-label="외곽선 비우기"
                    data-tip={editing ? "선택 외곽선 비우기" : "외곽선 비우기"}
                  >
                    <IconClose size={14} />
                  </Button>
                ) : null}
                <MixedBadge
                  visible={
                    editing ? readout.outline.mixed : isMixed(outlineWidth) || isMixed(outlineColor)
                  }
                />
              </div>
              <NumberSlider
                value={editing ? (readout.outline.width ?? 0) : outlineWidthValue}
                onValueChange={(v) => {
                  if (activeStyle !== null) {
                    activeStyle.setOutlineWidth(v); // per-range; <=0 clears the selection
                    return;
                  }
                  updateAll(editor, ids, (prev) => {
                    if (v <= 0) {
                      const next = { ...prev.attrs } as Record<string, unknown>;
                      delete next.textOutline;
                      return { attrs: next as Readonly<Record<string, unknown>> };
                    }
                    const prevColor =
                      (prev.attrs as unknown as TextAttrs).textOutline?.color ?? "#000000";
                    return {
                      attrs: { ...prev.attrs, textOutline: { color: prevColor, width: v } },
                    };
                  });
                }}
                min={0}
                max={12}
                step={0.5}
                format={(v) => (v <= 0 ? "없음" : `${v}px`)}
                aria-label="외곽선 두께"
                className="w-full"
              />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="배경·간격" data-testid="text-spacing-group">
            <Bar.Field label="배경">
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
            <Bar.Field label="줄 간격">
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
            <Bar.Field label="자간">
              <NumberSlider
                value={
                  editing
                    ? editLetterSpacing?.mixed
                      ? 0
                      : ((editLetterSpacing?.value as number | undefined) ??
                        (isMixed(letterSpacing) ? 0 : letterSpacing))
                    : isMixed(letterSpacing)
                      ? 0
                      : letterSpacing
                }
                onValueChange={(v) => {
                  if (activeStyle !== null) {
                    activeStyle.setStyleProp("letterSpacing", v, { continuous: true }); // per-range (slider)
                    return;
                  }
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, letterSpacing: v },
                  }));
                }}
                min={-5}
                max={20}
                step={0.5}
                format={(v) => `${v}px`}
                aria-label="Letter spacing"
                className="w-full"
              />
              <MixedBadge visible={editing ? !!editLetterSpacing?.mixed : isMixed(letterSpacing)} />
            </Bar.Field>
          </AccordionItem>
          <AccordionItem label="넘침" data-testid="text-wrap-group">
            <Bar.Field label="넘침 처리">
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
              <Bar.Field label="줄임">
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
              <Bar.Field label="최대 줄 수">
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
            <Bar.Field label="링크">
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
            <Bar.Field label="불투명도">
              <OpacityControl editor={editor} ids={ids} />
            </Bar.Field>
          </AccordionItem>
        </Accordion>
      </Bar.More>
    </>
  );
};
