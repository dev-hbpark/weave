// WI-023 Phase 15 + Phase 18 — TextBlock renderer.
//
// Paints a TextAttrs item as a styled <div>. Inline-edit via EditableText
// when an `onUpdate` is wired (= edit mode). Read-only render in present
// mode (no editor handles attached).
//
// All typographic numbers are in DESIGN pixels, not screen pixels — the
// camera/Stage transform scales the whole layer including the text, so a
// 24-design-pixel text reads larger on screen as the user zooms in.
//
// DR-053 Stage 3 — PURE renderer. The agocraft layout engine OWNS all sizing;
// TextBlock just paints the text inside its engine-assigned frame box (fill +
// wrap). The old render-timing ResizeObserver auto-fit (measure rendered content
// → write frame.height/width back) is REMOVED — that measure-and-write-back loop
// fought the engine and caused the 자동너비/자동높이/고정 regressions. Content-driven
// sizing (text → its own box and → its container) is a separate step, fed into
// the engine as an input rather than measured at render time.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  resolveFontSize,
  type TextDecoration,
  type TextRun,
} from "@agocraft/core";
import {
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSelection } from "../interactions/selection-context.js";
import { textEditTrigger } from "../interactions/text-edit-trigger.js";
import { useResolveColor } from "../style/resolver-context.js";
import { type AgoItem, isItemLocked, type TextAttrs, type WeaveRunStyle } from "../types.js";
import { ParentFrameHeightContext } from "./parent-frame-context.js";
import { useTextFit } from "./text-autofit-context.js";
import { isTextAutofitEnabled, MAX_REFIT_ATTEMPTS, shouldRefitHeight } from "./text-autofit.js";

// R3 (WI-029 lazy-load): Lexical is ~55 KB gz of editor machinery. We don't
// need it in present mode — and even in edit mode, defer until the user
// actually focuses a text box. Suspense's fallback is a transparent stub
// that matches the inner div's dimensions, so layout doesn't jump.
const LexicalTextEditor = lazy(() =>
  import("./LexicalTextEditor.js").then((m) => ({ default: m.LexicalTextEditor })),
);

interface TextBlockProps {
  readonly item: AgoItem<"text">;
  readonly onUpdate?: (patch: Partial<TextAttrs>) => void;
}

export function TextBlock({ item, onUpdate }: TextBlockProps) {
  const a = item.attrs;
  const editable = onUpdate !== undefined;
  // DR-057 — once `textRuns` exists it is the SINGLE SOURCE OF TRUTH for inline
  // formatting (bold / italic / underline). The container then neutralizes its
  // own inline toggleables so per-run <span>s are the sole authority — a run
  // with no bold attr renders normal (the explicit un-bold that the inherited
  // item-level weight previously made impossible). With no runs (plain /
  // legacy) the container keeps applying the item-level attrs unchanged.
  // `textRuns` is typed `TextRun[] | undefined`, but the agent's open attrs bag
  // can inject `null` (e.g. an edit that tries to clear runs); guard with
  // Array.isArray so a null never deref-crashes the renderer.
  const hasRuns = Array.isArray(a.textRuns) && a.textRuns.length > 0;

  // Phase 2 (fontSizeSpec) — resolve the font size to design-px. A `ratio`
  // spec scales with the parent frame's height (provided via context by the
  // enclosing NestedFrame; root = design height). px / legacy-number ignore it.
  // The Stage's `transform: scale` then maps design-px → screen-px as usual.
  const parentHeightPx = useContext(ParentFrameHeightContext);
  const resolvedFontSizePx = resolveFontSize(a.fontSizeSpec, a.fontSize, parentHeightPx);

  // WI-040 — color / background may be a `StyleRef` (theme token) written
  // by the text-section picker when the user picked a theme swatch.
  // Resolve via the cascade hook so ancestor `style.provider` Units could
  // override the token; falls back to the raw string when no provider
  // context is mounted (tests / preview).
  const itemRef = item as unknown as AgocraftItem;
  const resolvedColor = useResolveColor(a.color, itemRef, undefined);
  const resolvedBg = useResolveColor(a.background, itemRef, undefined);
  // DR-059 — text outline. Resolve the outline color through the same cascade
  // as fill/background so a theme token works. The outline renders as a thick
  // stroked back layer behind the fill (see the two-layer render below).
  const resolvedOutlineColor = useResolveColor(a.textOutline?.color, itemRef, undefined);
  const hasOutline =
    a.textOutline !== undefined && a.textOutline.width > 0 && resolvedOutlineColor !== undefined;

  // DR-053 Stage 3 — TextBlock is a PURE renderer. The agocraft layout engine
  // OWNS all sizing: the text fills its engine-assigned frame box and wraps to
  // it. There is NO render-timing measure-and-write-back (the old ResizeObserver
  // auto-fit) — that loop fought the engine and caused the 자동너비/자동높이/고정
  // regressions. Content-driven sizing (text → its own box, and → its container)
  // is a separate step, fed into the engine as an input, not measured at render.
  // `innerRef`/`data-text-content` remain so the selection chrome can track the
  // rendered content box.
  const innerRef = useRef<HTMLDivElement | null>(null);
  // WI-029 — edit mode: double-click mounts the Lexical editor in place and the
  // read-only render is hidden while editing.
  const [isEditing, setIsEditing] = useState(false);

  // Phase 1 (WI-029) — Figma-equivalent text attrs:
  //   textAlignVertical → flex justify-content
  //   textDecoration → CSS text-decoration
  //   textCase → CSS text-transform (SMALL_CAPS degrades to lowercase + font-variant)
  //   paragraphSpacing / paragraphIndent → margin-top on \n-split paragraphs (best-effort
  //     until Phase 2 rich text editor renders runs)
  //   textTruncation = "ENDING" + maxLines → -webkit-line-clamp
  //   hyperlink → wrap content in <a> when set
  //   layoutChild = Fixed (any non-scale anchor) → overflow: hidden (auto-height ResizeObserver no-ops)
  const verticalAlign = a.textAlignVertical ?? "TOP";
  // Phase 1.5 Phase A — prefer the UPPERCASE `textAlignHorizontal` (Figma-
  // convention) and fall back to legacy lowercase `textAlign` for v6
  // docs that haven't been migrated. Always map back to the lowercase
  // CSS `text-align` value at the render boundary.
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
  // Phase 1.5 Phase B — prefer `lineHeightSpec` (explicit unit) over the
  // legacy `lineHeight: number` (always a multiplier). The CSS line-height
  // value is unit-aware: `multiplier` becomes a plain number, `px` becomes
  // a `${n}px` string.
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
  // DR-053 Stage 3 — the engine OWNS the box; the text fills + wraps to it. No
  // `max-content` (that only existed so the removed ResizeObserver could read the
  // natural width). Overflow is user-controlled via `textOverflow` (default spill);
  // content-driven box sizing is a later engine-fed step.
  const clipOverflow = a.textOverflow === "HIDDEN";
  // Ellipsis truncation is a refinement of clipping — only meaningful when the
  // content is clipped. (No longer gated to Fixed mode.)
  const truncate = clipOverflow && a.textTruncation === "ENDING";
  const containerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    // `HIDDEN` clips overflow; `VISIBLE` lets content spill. Default derives
    // from the resize mode when `textOverflow` is unset.
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
    // No padding — the frame box must equal the rendered text bounds so the
    // selection rubber band hugs the text exactly on the auto axis (and the
    // auto-fit ratio = scrollSize / parentOffsetSize needs no padding term).
    padding: 0,
    ...(resolvedBg !== undefined ? { background: resolvedBg } : {}),
    // DR-028 — opacity is a decoration UNIT (no legacy attr fallback).
    opacity:
      (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
      1,
  };
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
        return "lowercase"; // graceful — font-variant adds small-caps glyphs below
      default:
        return "none";
    }
  })();
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
    // Engine-owned box: the content fills the frame width and wraps to it.
    width: "100%",
    flexShrink: 0,
    fontFamily: a.fontFamily,
    fontSize: `${resolvedFontSizePx}px`,
    // DR-057 — neutralize inline toggleables when runs drive them; otherwise
    // apply the item-level base (legacy / plain text).
    fontWeight: hasRuns ? "normal" : a.fontWeight,
    fontStyle: hasRuns ? "normal" : a.fontStyle,
    color: resolvedColor,
    textAlign: horizontalAlign,
    lineHeight: lineHeightValue,
    letterSpacing: `${a.letterSpacing}px`,
    whiteSpace: "pre-wrap",
    // WI-149 — break at WORD boundaries, NEVER mid-character. When the flex
    // engine starves a text row child toward 0 width (auto-flex shrink floors at
    // 0, not at content min-size — agocraft has no text measurement), the box can
    // be narrower than a single glyph. `overflow-wrap:break-word` then force-broke
    // EVERY word at the overflow point → one glyph per line → an illegible
    // VERTICAL ribbon (+ runaway auto-height). We drop overflow-wrap so words
    // stay whole: `keep-all` keeps Korean 어절 / CJK runs intact and wrapping
    // happens only at real break opportunities (spaces). A box too narrow for a
    // word now overflows that word horizontally on one line (legible) instead of
    // shattering it vertically. Trade-off: a genuinely unbreakable long token (a
    // spaceless URL) overflows rather than breaking — rare, and far better than a
    // glyph ribbon; the durable fix is keeping wrapping text out of starved flex
    // rows (capabilities + small-think guidance) and the layout shrink floor.
    wordBreak: "keep-all",
    overflowWrap: "normal",
    textDecoration: hasRuns ? "none" : decoration,
    textTransform,
    ...(a.textCase === "SMALL_CAPS" ? { fontVariantCaps: "small-caps" } : {}),
    // Don't allow the rendered content to be narrower than one character
    // visually — caps how aggressively width can collapse. The frame box's
    // width is set by frame.width; this just stops the inner text from
    // dropping below a 1ch ribbon.
    minWidth: "1ch",
    ...truncateStyles,
  };

  // Phase 1 (WI-029): if hyperlink is set and we're in present mode (not
  // editable), wrap the text in <a target=_blank>. Edit mode never wraps so
  // the user can still click into the box to edit.
  //
  // Phase 2 (DR-015 Accepted 2026-05-25): Lexical RichTextPlugin replaces
  // design-system EditableText. Cmd+B / Cmd+I / Cmd+U work via Lexical's
  // native shortcuts. Per-range formatting captured into textRuns +
  // mirrored to attrs (host writes both text + textRuns on every change).
  //
  // Present mode renders textRuns directly (with <span> styling) when
  // available — preserves bold/italic/underline/strikethrough that the
  // user applied in edit mode.
  // WI-029 follow-up — text edit mode is gated by double-click + tied
  // to FRAME selection (not pointer location). A single click on the
  // text item selects the frame (no edit). Double-click flips
  // `isEditing = true`, mounting LexicalTextEditor + grabbing the
  // caret. Edit mode exits only when:
  //   (a) the frame is deselected (click on empty design plane / other
  //       frame), OR
  //   (b) the Escape key is pressed.
  // Clicks on PropertiesPanel / ContextualToolbar / submenu keep
  // selection AND edit mode alive — the old document-pointerdown
  // dismissal was too aggressive (Cmd+B menu, range selection +
  // format click were all falsely dismissing).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { selection, selectFrame } = useSelection();
  const selfId = String(item.id);
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
  // hotkey (DesignPage) can enter edit mode by item id, no kind compare.
  // Same entry path as double-click: select first (keeps the isFrameSelected
  // gate alive), then mount the Lexical editor (select-all on focus).
  useEffect(() => {
    if (!editable || isItemLocked(item)) return undefined;
    return textEditTrigger.register(selfId, () => {
      selectFrame(selfId);
      setIsEditing(true);
    });
  }, [editable, item, selfId, selectFrame]);
  // WI-237/DR-152 + WI-238/DR-153 — content-height auto-fit (default ON). Measure
  // the content's intrinsic height (innerRef, at the engine-bound width) vs the
  // engine box (wrapRef) and, on divergence, REPORT the raw numbers to the provider.
  // The provider routes by the item's REAL parent layout (grid → grow the grid
  // frame; flex/absolute → correct the text's own height) — so it is correct even
  // when the child's own `layoutChild` is stale (e.g. reparented into a grid).
  // Convergent (width fixed) + threshold + a hard attempt cap (no thrash).
  const requestFit = useTextFit();
  const refitAttempts = useRef(0);
  const refitKey = `${selfId}|${a.text}|${resolvedFontSizePx}`;
  const lastRefitKey = useRef("");
  if (lastRefitKey.current !== refitKey) {
    lastRefitKey.current = refitKey;
    refitAttempts.current = 0; // content/font changed → allow fitting again
  }
  useEffect(() => {
    if (!isTextAutofitEnabled() || requestFit === null) return undefined;
    if (isEditing || isItemLocked(item)) return undefined;
    const box = wrapRef.current;
    const content = innerRef.current;
    if (box === null || content === null) return undefined;
    if (typeof a.frame?.height !== "number" || !(a.frame.height > 0)) return undefined;
    const measure = (): void => {
      if (refitAttempts.current >= MAX_REFIT_ATTEMPTS) return;
      const boxPx = box.clientHeight;
      const contentPx = content.scrollHeight;
      if (!(boxPx > 0) || !(contentPx > 0)) return;
      if (!shouldRefitHeight(boxPx, contentPx)) return; // converged within threshold
      refitAttempts.current += 1;
      requestFit({ itemId: selfId, boxPx, contentPx, currentFrame: a.frame });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
    // a.frame.height re-runs the effect after a resize lands (drives convergence).
  }, [requestFit, selfId, isEditing, item, a.frame, refitKey]);

  // DR-057 — WYSIWYG: the editor surface renders in the item's resolved base
  // typography. Inline toggleables are forced NEUTRAL here so the seeded
  // per-node formats (and Lexical's `font-bold`/`italic`/`underline` theme
  // classes) are the sole authority — matching the read-only container above.
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
  // DR-062 — the item-level BASE for each per-range CSS property, keyed by CSS
  // prop name. Passed to the editor so the selection readout reads a non-
  // overriding sub-range as that single base value (not "mixed").
  const baseRangeStyle: Readonly<Record<string, string>> = {
    color: resolvedColor ?? a.color,
    "font-size": `${resolvedFontSizePx}px`,
    "font-family": a.fontFamily,
    "letter-spacing": `${a.letterSpacing}px`,
    "text-transform": textTransform,
  };
  // The item-level inline toggleables, expressed as the BLOCK BASE the editor
  // seed projects into the plain-text fallback (so a toolbar-bolded box with no
  // runs yet opens already bold). Undefined when nothing is set → seed stays
  // un-styled. STRIKETHROUGH wins only when UNDERLINE is absent (single slot).
  const baseInlineFormat = (() => {
    const base: { fontWeight?: "bold"; fontStyle?: "italic"; textDecoration?: TextDecoration } = {};
    if (a.fontWeight === "bold") base.fontWeight = "bold";
    if (a.fontStyle === "italic") base.fontStyle = "italic";
    if (a.textDecoration === "UNDERLINE" || a.textDecoration === "STRIKETHROUGH")
      base.textDecoration = a.textDecoration;
    return Object.keys(base).length > 0 ? base : undefined;
  })();
  const inner =
    editable && isEditing ? (
      <Suspense fallback={renderReadOnly(a.text, a.textRuns)}>
        <LexicalTextEditor
          anchorId={String(item.id)}
          value={a.text}
          {...(Array.isArray(a.textRuns) ? { initialTextRuns: a.textRuns } : {})}
          {...(baseInlineFormat !== undefined ? { baseInlineFormat } : {})}
          contentStyle={editorContentStyle}
          baseRangeStyle={baseRangeStyle}
          onChange={(snapshot) => onUpdate?.({ text: snapshot.text, textRuns: snapshot.textRuns })}
          editable={editable}
        />
      </Suspense>
    ) : (
      renderReadOnly(a.text, a.textRuns)
    );
  const linked =
    !editable && a.hyperlink != null && a.hyperlink.url.length > 0 ? (
      // WI-090 (DR-052 §2) — when a text item carries BOTH an inline hyperlink
      // and an item-level link (the button-trigger overlay, z-index 1), raise
      // the inline `<a>` above that overlay so clicking the linked text opens
      // the inline URL while empty box area still fires the item-level link.
      <a
        href={a.hyperlink.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "inherit", textDecoration: "inherit", position: "relative", zIndex: 2 }}
      >
        {inner}
      </a>
    ) : (
      inner
    );

  // DR-059 — layered text outline. Render the same glyphs TWICE inside the
  // measured `[data-text-content]` box: a thick stroked back layer (outline
  // color, absolute, behind) and the normal fill on top. Only in read-only /
  // present (not while the single-layer Lexical editor is mounted). The back is
  // absolute so it never affects the auto-fit measurement (front defines the
  // box); `-webkit-text-stroke` is paint, not layout. Inherits font / align /
  // wrap from the container so the two layers register exactly.
  // DR-060 — per-range outline: a run may carry its own outline. The back layer
  // shows when the item has a whole-item outline OR any run does.
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
        // The whole-item outline (DR-059) is applied at the container so runs
        // without a per-run outline inherit it; per-run outlines override on
        // their own span (DR-060). When there is NO whole-item outline, the
        // container forces nothing — non-outlined runs render transparent.
        ...(hasOutline
          ? {
              color: resolvedOutlineColor,
              // 2× the visible halo: the stroke is centered on the glyph
              // outline, so half extends outside; the same-color fill makes the
              // inside solid and the front fill covers it. paint-order coherent.
              WebkitTextStroke: `${(a.textOutline?.width ?? 0) * 2}px ${resolvedOutlineColor}`,
              paintOrder: "stroke",
            }
          : {}),
      }
    : null;
  const contentNode = showOutline ? (
    <>
      <span aria-hidden="true" data-text-outline style={outlineLayerStyle ?? undefined}>
        {renderReadOnly(a.text, a.textRuns, "outline", hasOutline)}
      </span>
      <span style={{ position: "relative", zIndex: 1 }}>{linked}</span>
    </>
  ) : (
    linked
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: interaction surface (canvas/overlay/affordance), not a control — keyboard & focus handled by dedicated controls elsewhere
    <div
      ref={wrapRef}
      // While editing, always let the editor spill (overflow visible) so the
      // text the user is typing is never clipped, regardless of the chosen
      // `textOverflow` — the chrome tracks the live content via FrameStage.
      style={isEditing ? { ...containerStyle, overflow: "visible" } : containerStyle}
      data-testid="text-block"
      // DR-062 — while editing, the text surface is an extension of the open
      // contextual toolbar: a pointerdown / focus bounce here (Lexical returns
      // DOM focus to the contentEditable when a per-range style is applied) must
      // NOT dismiss the More popover. The design-system Popover honors this
      // marker for both its capture-phase backstop and Radix's interact-outside.
      {...(isEditing ? { "data-dismiss-exempt": "true", "data-weave-text-editor": "true" } : {})}
      onDoubleClick={(e) => {
        if (!editable) return;
        // DR-061 — a locked text item is selectable but not editable.
        if (isItemLocked(item)) {
          e.stopPropagation();
          selectFrame(selfId);
          return;
        }
        e.stopPropagation();
        // Select this item first so the `isFrameSelected` gate (which keeps
        // edit mode alive) passes on the same interaction — works whether or
        // not the item was already selected, so a single double-click enters
        // edit mode (no extra click). The Lexical editor then auto-focuses
        // and selects all text on mount.
        selectFrame(selfId);
        setIsEditing(true);
      }}
    >
      {/* `data-text-content` marks the live, content-sized element the
          selection chrome measures on the auto axis (FrameStage `boundsOf`),
          so the rubber band/handles track typing without the model lag. */}
      <div
        ref={innerRef}
        data-text-content
        // DR-059 — positioning context for the absolute outline back layer
        // (only when outlined, to leave the non-outline DOM untouched).
        style={showOutline ? { ...textStyle, position: "relative" } : textStyle}
      >
        {contentNode}
      </div>
    </div>
  );
}

/** Present-mode rich-text renderer. When `textRuns` is present, map each
 *  run to a `<span>` with inline style from PartialTextStyle. Otherwise
 *  fall back to the plain `text` projection (Phase 1 attrs shape).
 *
 *  Format precedence in present mode mirrors LexicalTextEditor's bitmask:
 *  UNDERLINE wins over STRIKETHROUGH when both attributes are applied
 *  (CSS `text-decoration` slot is shared). The block-level `textDecoration`
 *  on TextAttrs is applied at the container; per-run overrides win locally. */
function renderReadOnly(
  text: string,
  textRuns: ReadonlyArray<TextRun> | undefined,
  // "outline" produces the back layer of the layered-outline render: GLYPH-SHAPE
  // props (family / size / weight / style / spacing / case) plus the outline
  // stroke; `color` / `textDecoration` are dropped. "fill" is the normal render.
  mode: "fill" | "outline" = "fill",
  // DR-060 — whether the ITEM carries a whole-item outline. In outline mode, a
  // run WITHOUT its own per-run outline inherits the container's whole-item
  // outline when this is true, else renders transparent (paints no halo).
  itemHasOutline = false,
): ReactNode {
  if (!Array.isArray(textRuns) || textRuns.length === 0) return text;
  const outline = mode === "outline";
  return textRuns.map((run, i) => {
    // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
    if (run.insert === "\n") return <br key={`br-${i}`} />;
    const attrs = run.attributes as WeaveRunStyle | undefined;
    const style: CSSProperties = {};
    if (attrs !== undefined) {
      if (attrs.fontWeight === "bold") style.fontWeight = "bold";
      if (attrs.fontStyle === "italic") style.fontStyle = "italic";
      if (attrs.fontSize !== undefined) style.fontSize = `${attrs.fontSize}px`;
      if (attrs.fontFamily !== undefined) style.fontFamily = attrs.fontFamily;
      if (attrs.letterSpacing !== undefined) style.letterSpacing = `${attrs.letterSpacing}px`;
      if (attrs.textCase === "UPPER") style.textTransform = "uppercase";
      else if (attrs.textCase === "LOWER") style.textTransform = "lowercase";
      else if (attrs.textCase === "TITLE") style.textTransform = "capitalize";
    }
    if (!outline) {
      // Fill-only: per-run color + decoration.
      if (attrs?.color !== undefined) style.color = attrs.color;
      if (attrs?.textDecoration === "UNDERLINE") style.textDecoration = "underline";
      else if (attrs?.textDecoration === "STRIKETHROUGH") style.textDecoration = "line-through";
    } else {
      // DR-060 — back layer. A run with its own outline strokes itself (2× the
      // visible halo, as DR-059); a run without one inherits the item-level
      // outline when present, else paints nothing (transparent).
      const ow = attrs?.outlineWidth;
      if (ow !== undefined && ow > 0) {
        const oc = attrs?.outlineColor ?? "#000000";
        style.color = oc;
        style.WebkitTextStroke = `${ow * 2}px ${oc}`;
        style.paintOrder = "stroke";
      } else if (!itemHasOutline) {
        style.color = "transparent";
        style.WebkitTextStroke = "0";
      }
    }
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
      <span key={i} style={style}>
        {run.insert}
      </span>
    );
  });
}
