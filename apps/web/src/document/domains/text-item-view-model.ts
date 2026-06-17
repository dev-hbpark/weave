// WI-243 / DR-160 — text content ViewModel (per-item, content surface).
//
// Owns everything TextBlock's render does NOT: attr resolution (font-size spec,
// theme-token color/background/outline via the cascade hook), the Figma-attr →
// CSS mapping (align / line-height / decoration / case → containerStyle +
// textStyle), the synchronous model-measured shrink-to-fit (`fitScale`, NO DOM
// read / ResizeObserver / RAF — DR-053/WI-051), the edit-mode FSM (`isEditing` +
// escape / textEditTrigger / frame-selection-gate effects), and the editor seed
// styles (editorContentStyle / baseRangeStyle / baseInlineFormat).
//
// Touches NO DOM (no refs, no measurement of rendered nodes) → `renderHook`-
// testable with the engine text measurer + fake selection/color providers, no
// canvas. The paired pure View (`TextView`) lives in TextBlock.tsx and assembles
// the JSX (read-only runs, layered outline, hyperlink wrap, Lexical editor).
//
// `import type { RichTextSnapshot }` keeps Lexical type-only here so the editor
// chunk stays code-split (TextBlock lazy-loads the runtime).
//
// WI-243 transitional: TextBlock stays the registered renderer and calls this
// hook directly until the Phase-0 spec facet (HANDOFF-002) flips the SPECS entry
// to `useViewModel: useTextItemViewModel, view: TextView`.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  resolveFontSize,
  type TextDecoration,
  type TextRun,
} from "@agocraft/core";
import { type CSSProperties, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSelection } from "../interactions/selection-context.js";
import { textEditTrigger } from "../interactions/text-edit-trigger.js";
import { engineTextMeasureEnabled, getEngineTextMeasurer } from "../layout/text-measurer.js";
import { useResolveColor } from "../style/resolver-context.js";
import { type AgoItem, isItemLocked, type TextAttrs } from "../types.js";
import { deriveTextAutoResize } from "./derive-text-auto-resize.js";
import type { RichTextSnapshot } from "./LexicalTextEditor.js";
import { ItemBoxContext, ParentFrameHeightContext } from "./parent-frame-context.js";
import { fitFontScale, isTextAutofitEnabled } from "./text-autofit.js";
import { MIN_TEXT_WIDTH_CSS, minFitScaleFor } from "./text-fit-floors.js";

export interface TextItemVm {
  // ── Content the View renders (projected from the model so the View never
  //    reads `item.*` — it binds to the vm only) ──
  /** `String(item.id)` — the Lexical editor anchor. */
  readonly anchorId: string;
  readonly text: string;
  readonly textRuns: ReadonlyArray<TextRun> | undefined;
  /** The inline-hyperlink href, defined ONLY when the link should render
   *  (present mode + a non-empty url). `undefined` → no `<a>` wrap. */
  readonly linkHref: string | undefined;
  readonly editable: boolean;
  readonly isEditing: boolean;
  readonly hasRuns: boolean;
  readonly hasOutline: boolean;
  readonly showOutline: boolean;
  readonly containerStyle: CSSProperties;
  readonly textStyle: CSSProperties;
  readonly editorContentStyle: CSSProperties;
  readonly outlineLayerStyle: CSSProperties | null;
  readonly baseRangeStyle: Readonly<Record<string, string>>;
  readonly baseInlineFormat:
    | { fontWeight?: "bold"; fontStyle?: "italic"; textDecoration?: TextDecoration }
    | undefined;
  readonly fitScale: number;
  readonly fitTransformOrigin: string;
  /** Select this text's frame and (if unlocked) enter edit mode. Caller owns the
   *  event (`stopPropagation` + the `editable` gate stay in the View). */
  readonly onDoubleClick: () => void;
  readonly onEditorChange: (snapshot: RichTextSnapshot) => void;
}

export function useTextItemViewModel(
  item: AgoItem<"text">,
  onUpdate?: (patch: Partial<TextAttrs>) => void,
): TextItemVm {
  const a = item.attrs;
  const editable = onUpdate !== undefined;
  const selfId = String(item.id);
  const hasRuns = Array.isArray(a.textRuns) && a.textRuns.length > 0;

  // ── DI: all Context reads gather here (the View needs no provider) ──
  const parentHeightPx = useContext(ParentFrameHeightContext);
  const itemBox = useContext(ItemBoxContext);
  const itemRef = item as unknown as AgocraftItem;
  const resolvedColor = useResolveColor(a.color, itemRef, undefined);
  const resolvedBg = useResolveColor(a.background, itemRef, undefined);
  const resolvedOutlineColor = useResolveColor(a.textOutline?.color, itemRef, undefined);
  const { selection, selectFrame } = useSelection();

  // ── Edit-mode FSM + effects ──
  const [isEditing, setIsEditing] = useState(false);
  const isFrameSelected =
    selection !== null && selection.kind === "frame" && selection.id === selfId;
  useEffect(() => {
    if (!isEditing) return;
    if (!isFrameSelected) {
      setIsEditing(false);
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setIsEditing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [isEditing, isFrameSelected]);
  // WI-183 — Enter-to-edit: register this surface so the editor-level Enter
  // hotkey can enter edit mode by item id, no kind compare.
  useEffect(() => {
    if (!editable || isItemLocked(item)) return undefined;
    return textEditTrigger.register(selfId, () => {
      selectFrame(selfId);
      setIsEditing(true);
    });
  }, [editable, item, selfId, selectFrame]);
  const onDoubleClick = useCallback(() => {
    // DR-061 — a locked text item is selectable but not editable.
    selectFrame(selfId);
    if (!isItemLocked(item)) setIsEditing(true);
  }, [selectFrame, selfId, item]);
  const onEditorChange = useCallback(
    (snapshot: RichTextSnapshot) =>
      onUpdate?.({ text: snapshot.text, textRuns: snapshot.textRuns }),
    [onUpdate],
  );

  // ── Derivation: font size, align, line-height, decoration, case ──
  const resolvedFontSizePx = resolveFontSize(a.fontSizeSpec, a.fontSize, parentHeightPx);
  const hasOutline =
    a.textOutline !== undefined && a.textOutline.width > 0 && resolvedOutlineColor !== undefined;
  const verticalAlign = a.textAlignVertical ?? "TOP";
  const horizontalAlign: "left" | "center" | "right" | "justify" = (() => {
    if (a.textAlignHorizontal !== undefined) {
      switch (a.textAlignHorizontal) {
        case "LEFT":
          return "left";
        case "CENTER":
          return "center";
        case "RIGHT":
          return "right";
        case "JUSTIFIED":
          return "justify";
      }
    }
    return a.textAlign;
  })();
  const lineHeightValue: string | number = (() => {
    const spec = a.lineHeightSpec;
    if (spec !== undefined) {
      switch (spec.unit) {
        case "multiplier":
          return spec.value;
        case "px":
          return `${spec.value}px`;
      }
    }
    return a.lineHeight;
  })();
  const justifyContent =
    verticalAlign === "CENTER" ? "center" : verticalAlign === "BOTTOM" ? "flex-end" : "flex-start";
  const clipOverflow = a.textOverflow === "HIDDEN";
  const truncate = clipOverflow && a.textTruncation === "ENDING";
  const decoration = (() => {
    switch (a.textDecoration) {
      case "UNDERLINE":
        return "underline";
      case "STRIKETHROUGH":
        return "line-through";
      default:
        return "none";
    }
  })();
  const textTransform = (() => {
    switch (a.textCase) {
      case "UPPER":
        return "uppercase";
      case "LOWER":
        return "lowercase";
      case "TITLE":
        return "capitalize";
      case "SMALL_CAPS":
        return "lowercase";
      default:
        return "none";
    }
  })();

  const containerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    overflow: clipOverflow ? "hidden" : "visible",
    display: "flex",
    flexDirection: "column",
    justifyContent,
    alignItems:
      horizontalAlign === "center"
        ? "center"
        : horizontalAlign === "right"
          ? "flex-end"
          : "stretch",
    padding: 0,
    ...(resolvedBg !== undefined ? { background: resolvedBg } : {}),
    // DR-028 — opacity is a decoration UNIT (no legacy attr fallback).
    opacity:
      (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
      1,
  };
  const truncateStyles: CSSProperties = truncate
    ? {
        display: "-webkit-box",
        WebkitLineClamp: a.maxLines ?? 1,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }
    : {};
  const textStyle: CSSProperties = {
    width: "100%",
    flexShrink: 0,
    fontFamily: a.fontFamily,
    fontSize: `${resolvedFontSizePx}px`,
    // DR-057 — neutralize inline toggleables when runs drive them.
    fontWeight: hasRuns ? "normal" : a.fontWeight,
    fontStyle: hasRuns ? "normal" : a.fontStyle,
    color: resolvedColor,
    textAlign: horizontalAlign,
    lineHeight: lineHeightValue,
    letterSpacing: `${a.letterSpacing}px`,
    whiteSpace: "pre-wrap",
    // WI-149 — break at WORD boundaries, never mid-character (keep-all + normal).
    wordBreak: "keep-all",
    overflowWrap: "normal",
    textDecoration: hasRuns ? "none" : decoration,
    textTransform,
    ...(a.textCase === "SMALL_CAPS" ? { fontVariantCaps: "small-caps" } : {}),
    minWidth: MIN_TEXT_WIDTH_CSS,
    ...truncateStyles,
  };

  // ── Shrink-to-fit: SYNCHRONOUS, from MODEL STATE only (DR-053 / WI-051) ──
  const minFitScale = minFitScaleFor(resolvedFontSizePx);
  const lineHeightMult =
    a.lineHeightSpec?.unit === "multiplier"
      ? a.lineHeightSpec.value
      : typeof a.lineHeight === "number"
        ? a.lineHeight
        : 1.4;
  const lcKind = (a.layoutChild as { kind?: string } | undefined)?.kind;
  const engineHugged =
    engineTextMeasureEnabled() &&
    lcKind !== "auto-grid" &&
    deriveTextAutoResize(a.layoutChild) !== "NONE";
  const fitScale = useMemo(() => {
    if (!isTextAutofitEnabled() || isEditing || engineHugged) return 1;
    const measure = getEngineTextMeasurer();
    if (measure === undefined || itemBox === null) return 1;
    if (!(itemBox.w > 0) || !(itemBox.h > 0)) return 1;
    const text = typeof a.text === "string" ? a.text : "";
    if (text.length === 0) return 1;
    const r = measure({
      text,
      fontFamily: typeof a.fontFamily === "string" ? a.fontFamily : "sans-serif",
      fontSizePx: resolvedFontSizePx,
      lineHeight: lineHeightMult,
      letterSpacing: typeof a.letterSpacing === "number" ? a.letterSpacing : 0,
      maxWidthPx: itemBox.w,
    });
    if (!(r.heightPx > 0)) return 1;
    return fitFontScale(itemBox.h, r.heightPx, itemBox.w, r.widthPx, minFitScale);
  }, [
    isEditing,
    engineHugged,
    itemBox,
    resolvedFontSizePx,
    minFitScale,
    lineHeightMult,
    a.text,
    a.fontFamily,
    a.letterSpacing,
  ]);
  const fitTransformOrigin = `${
    horizontalAlign === "center" ? "center" : horizontalAlign === "right" ? "right" : "left"
  } ${verticalAlign === "CENTER" ? "center" : verticalAlign === "BOTTOM" ? "bottom" : "top"}`;

  // ── Editor seed styles (DR-057 / DR-062) ──
  const editorContentStyle: CSSProperties = {
    fontFamily: a.fontFamily,
    fontSize: `${resolvedFontSizePx}px`,
    color: resolvedColor,
    textAlign: horizontalAlign,
    lineHeight: lineHeightValue,
    letterSpacing: `${a.letterSpacing}px`,
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
  };
  const baseRangeStyle: Readonly<Record<string, string>> = {
    color: resolvedColor ?? a.color,
    "font-size": `${resolvedFontSizePx}px`,
    "font-family": a.fontFamily,
    "letter-spacing": `${a.letterSpacing}px`,
    "text-transform": textTransform,
  };
  const baseInlineFormat = (() => {
    const base: { fontWeight?: "bold"; fontStyle?: "italic"; textDecoration?: TextDecoration } = {};
    if (a.fontWeight === "bold") base.fontWeight = "bold";
    if (a.fontStyle === "italic") base.fontStyle = "italic";
    if (a.textDecoration === "UNDERLINE" || a.textDecoration === "STRIKETHROUGH")
      base.textDecoration = a.textDecoration;
    return Object.keys(base).length > 0 ? base : undefined;
  })();

  // ── Layered outline (DR-059 / DR-060) ──
  const anyRunOutline =
    a.textRuns?.some((r) => {
      const w = (r.attributes as { outlineWidth?: number } | undefined)?.outlineWidth;
      return w !== undefined && w > 0;
    }) ?? false;
  const showOutline = (hasOutline || anyRunOutline) && !(editable && isEditing);
  const outlineLayerStyle: CSSProperties | null = showOutline
    ? {
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        userSelect: "none",
        ...(hasOutline
          ? {
              color: resolvedOutlineColor,
              WebkitTextStroke: `${(a.textOutline?.width ?? 0) * 2}px ${resolvedOutlineColor}`,
              paintOrder: "stroke",
            }
          : {}),
      }
    : null;

  // Hyperlink gate (present mode + non-empty url) — derived here so the View
  // binds to a single `linkHref` instead of re-deriving from the model.
  const linkHref =
    !editable && a.hyperlink != null && a.hyperlink.url.length > 0 ? a.hyperlink.url : undefined;

  return {
    anchorId: selfId,
    text: a.text,
    textRuns: a.textRuns,
    linkHref,
    editable,
    isEditing,
    hasRuns,
    hasOutline,
    showOutline,
    containerStyle,
    textStyle,
    editorContentStyle,
    outlineLayerStyle,
    baseRangeStyle,
    baseInlineFormat,
    fitScale,
    fitTransformOrigin,
    onDoubleClick,
    onEditorChange,
  };
}
