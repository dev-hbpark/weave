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
// Phase 18 — auto-height: a ResizeObserver watches the rendered text
// content; whenever its height diverges from the current frame.height
// (in ratio of the parent container), we dispatch a frame.height update.
// Combined with the SelectionViewModel removing n/s handles for text
// items, the user can only set the WIDTH manually (edge or corner) and
// the height always follows the wrapped content.

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
import { isHistoryReplaying } from "../history-replay-state.js";
import { useSelection } from "../interactions/selection-context.js";
import { textEditTrigger } from "../interactions/text-edit-trigger.js";
import { useResolveColor } from "../style/resolver-context.js";
import {
  type AgoItem,
  type ItemFrame,
  isItemLocked,
  type TextAttrs,
  type WeaveRunStyle,
} from "../types.js";
import { deriveTextAutoResize, type LegacyTextAutoResize } from "./derive-text-auto-resize.js";
import {
  ContentAutoAxesContext,
  MeasureContentContext,
  ParentFrameHeightContext,
} from "./parent-frame-context.js";
import { onTextAutofitRequest } from "./text-autofit-signal.js";

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

  // Auto-height plumbing. The OUTER container fills the frame box; the
  // INNER content div is what we measure. We must use the inner div (not
  // the outer) because the outer is sized to frame.height — measuring it
  // would always return the current height, not the natural content
  // height.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<ItemFrame>(a.frame);
  frameRef.current = a.frame;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  // WI-215 — last committed CONTENT size in unscaled layout px (scrollHeight/
  // scrollWidth), used to gate the auto-fit on a REAL content change. -1 = not
  // yet measured (force the first fit). See the gate in measureAndCommit.
  const lastContentHpxRef = useRef(-1);
  const lastContentWpxRef = useRef(-1);
  // WI-029 / DR-016 — Fixed mode locks both dimensions. The ResizeObserver
  // must NOT auto-fit height in NONE; otherwise the user-set height would
  // be overwritten by content fit.
  //
  // DR-053 Stage 2 (b) — WHICH axes this text may auto-size to its content is a
  // LAYOUT decision, OWNED by the agocraft engine, not re-derived here. For a
  // laid-out (engine-managed) text the engine reports `{managed, width, height}`
  // via `ContentAutoAxesContext` (computed in NestedFrame): a FILL (stretch) or
  // FIXED (intrinsic) or growing axis returns false, so the observer never fights
  // the engine. For FREE / absolute text (`managed:false`) the engine owns no
  // sizing, so we keep the text-kind legacy auto-size from the `layoutChild`
  // anchor (`deriveTextAutoResize`). This is the per-axis source of truth for both
  // the observer (which axis to fit) and the render CSS below.
  const contentAutoAxes = useContext(ContentAutoAxesContext);
  const measureContent = useContext(MeasureContentContext);
  const legacyMode = deriveTextAutoResize(a.layoutChild);
  const fitWidth = contentAutoAxes.managed
    ? contentAutoAxes.width
    : legacyMode === "WIDTH_AND_HEIGHT";
  const fitHeight = contentAutoAxes.managed ? contentAutoAxes.height : legacyMode === "HEIGHT";
  // Render hint for overflow / max-content CSS below (auto-width wins the label).
  const autoResizeMode: LegacyTextAutoResize = fitWidth
    ? "WIDTH_AND_HEIGHT"
    : fitHeight
      ? "HEIGHT"
      : "NONE";
  const autoResizeRef = useRef(autoResizeMode);
  autoResizeRef.current = autoResizeMode;
  const fitWidthRef = useRef(fitWidth);
  fitWidthRef.current = fitWidth;
  const fitHeightRef = useRef(fitHeight);
  fitHeightRef.current = fitHeight;
  // Engine-managed text commits its content size through the engine
  // (`onContentMeasured`) so an auto axis is NOT silently stamped fixed; free text
  // writes its frame directly via `onUpdate` (the engine owns no sizing for it).
  const managedRef = useRef(contentAutoAxes.managed);
  managedRef.current = contentAutoAxes.managed;
  const measureContentRef = useRef(measureContent);
  measureContentRef.current = measureContent;
  const itemIdStr = String(item.id);
  const itemIdRef = useRef(itemIdStr);
  itemIdRef.current = itemIdStr;
  // Set below once `isEditing` is declared; the ResizeObserver reads it to
  // decide whether to skip its frame commit while editing (see the effect).
  const isEditingRef = useRef(false);
  // Exposes the effect-local `measureAndCommit` so the edit-exit effect can
  // run a single auto-fit when the user finishes typing.
  const measureCommitRef = useRef<(() => void) | null>(null);
  // WI-029 — edit mode: double-click mounts the Lexical editor in place and the
  // read-only render is hidden while editing. Declared early so the auto-fit
  // effects and the container style below can read it.
  const [isEditing, setIsEditing] = useState(false);
  isEditingRef.current = isEditing;

  useEffect(() => {
    const el = innerRef.current;
    if (el === null) return;
    // Measure the rendered content and commit a frame auto-fit, if it diverges
    // from the live doc frame. Re-reads `el`/`frameRef` at call time so a
    // debounced (deferred) invocation uses the LATEST content size, not a
    // stale snapshot from when the observer fired.
    const measureAndCommit = (): void => {
      const fitH = fitHeightRef.current;
      const fitW = fitWidthRef.current;
      // Neither axis is content-auto (Fixed / fully layout-owned) → do not fit.
      if (!fitH && !fitW) return;
      // DR-058 — during an undo/redo replay the frame was already restored by
      // the replayed patch; re-committing the fitted size here would spawn a
      // fresh user-command entry and CLEAR the redo stack. Skip while a history
      // replay is the most-recent applied change.
      if (isHistoryReplaying()) return;
      const frameEl = el.closest("[data-frame-id]");
      const parent = frameEl?.parentElement ?? null;
      if (parent === null) return;
      // CRITICAL: use the parent's UNSCALED layout size (`offsetWidth`/
      // `offsetHeight`) as the ratio denominator. `el.scrollWidth`/`scrollHeight`
      // are layout px (ignore the camera's CSS `transform: scale`), so the
      // denominator MUST also be unscaled. `getBoundingClientRect()` is post-
      // transform (scaled), which inflated the ratio by 1/zoom and made the
      // auto-fit box wrong at any zoom ≠ 100%. The container has no padding, so
      // the frame box equals the text's rendered bounds exactly (rubber band =
      // text on the auto axis).
      const parentW = parent.offsetWidth;
      const parentH = parent.offsetHeight;
      let nextHeight: number | undefined;
      let nextWidth: number | undefined;
      // Each axis is fitted INDEPENDENTLY per the engine's content-auto decision
      // (`fitHeight`/`fitWidth`): a laid-out hug child fits BOTH; a height-auto
      // cell fits only height; a fill/fixed axis is skipped (engine owns it).
      // Compare against the LIVE doc value (`frameRef`) rather than the last
      // dispatched one. An earlier dispatch can be overwritten by some other
      // write (e.g. an explicit `weave.item.update` from the host) and the
      // observer would otherwise refuse to re-converge.
      if (fitH && parentH > 0) {
        // WI-215 — re-settle height ONLY when the CONTENT actually changed (operator
        // principle: "재정리는 실제 크기 변화 시에만"). Content px (scrollHeight) depends
        // on WIDTH (wrapping), not on the parent's height — so a height-handle drag /
        // a parent-driven height change leaves it identical and MUST NOT rewrite the
        // ratio. The old gate compared the ratio against frameRef, but its denominator
        // (parentH) moves with the parent; when parentH is coupled to this child (a
        // flex-ROW cross axis, or nested relayout) every parentH wobble produced a
        // smaller ratio → re-frozen crossSize → a one-way ratchet to height 0. Gating
        // on content px breaks that loop while still re-fitting on a real rewrap.
        const contentHpx = el.scrollHeight;
        const contentChanged =
          lastContentHpxRef.current < 0 || Math.abs(contentHpx - lastContentHpxRef.current) >= 0.5;
        if (contentChanged) {
          const rounded = Math.round((contentHpx / parentH) * 10000) / 10000;
          if (Math.abs(rounded - frameRef.current.height) >= 0.0005) nextHeight = rounded;
          lastContentHpxRef.current = contentHpx;
        }
      }
      // Auto-width measures `scrollWidth` — the inner div is sized
      // `width: max-content` in this mode (see textStyle), so it reports the
      // natural (un-wrapped) content width instead of echoing the frame width;
      // width exposes no handle, so this is the only way the box tracks content.
      // Same content-delta gate (WI-215): only re-fit when the natural content
      // width actually changed, not when the parent width moved underneath it.
      if (fitW && parentW > 0) {
        const contentWpx = el.scrollWidth;
        const contentChanged =
          lastContentWpxRef.current < 0 || Math.abs(contentWpx - lastContentWpxRef.current) >= 0.5;
        if (contentChanged) {
          const rounded = Math.round((contentWpx / parentW) * 10000) / 10000;
          if (Math.abs(rounded - frameRef.current.width) >= 0.0005) nextWidth = rounded;
          lastContentWpxRef.current = contentWpx;
        }
      }
      if (nextHeight === undefined && nextWidth === undefined) return;
      if (managedRef.current) {
        // Engine-managed: report the measured content; the engine applies it to
        // the auto axes WITHOUT stamping a fixed intrinsic (auto stays auto). NEVER
        // write the frame directly — that path (onFrameChanged) would convert the
        // auto axis to crossSize/sizeH and break fill/auto. Falls back to onUpdate
        // only when no provider is mounted (tests / preview).
        const commit = measureContentRef.current;
        if (commit !== null) {
          commit(itemIdRef.current, {
            ...(nextHeight !== undefined ? { height: nextHeight } : {}),
            ...(nextWidth !== undefined ? { width: nextWidth } : {}),
          });
          return;
        }
      }
      onUpdateRef.current?.({
        frame: {
          ...frameRef.current,
          ...(nextHeight !== undefined ? { height: nextHeight } : {}),
          ...(nextWidth !== undefined ? { width: nextWidth } : {}),
        },
      });
    };

    measureCommitRef.current = measureAndCommit;
    // While editing we DON'T commit the auto-fit to the model: every keystroke
    // emits a full-attrs `weave.item.update` (text), and an interleaved frame
    // commit would be clobbered by the text commit's stale snapshot (the race
    // that previously forced a debounce). Instead the editor overflows freely
    // and the selection chrome tracks the LIVE content element directly (see
    // FrameStage `boundsOf`), so the box/handles stay glued without a model
    // round-trip. The model is reconciled once when editing ends. Outside edit
    // (direct content set, edge-resize wrap) we commit immediately.
    const ro = new ResizeObserver(() => {
      if (isEditingRef.current) return;
      measureAndCommit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reconcile the model frame to the rendered content with one deferred auto-fit
  // (the `measureAndCommit` no-ops for Fixed/NONE and while editing). Runs on:
  //   • edit-exit — the ResizeObserver was muted during editing; and
  //   • a LAYOUT change — the resize MODE or the box WIDTH changed (WI-145: the
  //     observer's initial fit gets grouped into the agent transaction and
  //     clobbered by setLayout, and the inner content size doesn't change after,
  //     so the observer never re-fires).
  // NOTE: this intentionally does NOT depend on `a.frame.height`. A height-write
  // trigger (the reverted WI-146 B) re-ran the fit on EVERY height change — which
  // fired all through a manual frame RESIZE, fighting the gesture. Agent-generated
  // text instead re-settles via the round-end pulse below (B-2), so we don't need
  // the height dep and avoid the resize interference.
  // biome-ignore lint/correctness/useExhaustiveDependencies: autoResizeMode / a.frame.width are intentional RE-RUN TRIGGERS (re-fit when the layout context changes), not values read in the body — removing them defeats the fix.
  useEffect(() => {
    if (isEditing) return;
    const raf = requestAnimationFrame(() => measureCommitRef.current?.());
    return () => cancelAnimationFrame(raf);
  }, [isEditing, autoResizeMode, a.frame.width]);

  // WI-146 — re-settle on an agent ROUND-END pulse. After a batched generation
  // round the auto-fit can be left un-settled (overlapping / oversized) because
  // the observer never re-fires; the round-grouping editor pulses this so every
  // auto-height text runs the SAME fit a manual edit-exit would — no edit needed.
  useEffect(() => {
    return onTextAutofitRequest(() => {
      if (isEditingRef.current) return;
      requestAnimationFrame(() => measureCommitRef.current?.());
    });
  }, []);

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
  const isFixed = autoResizeMode === "NONE";
  // Auto-width (WIDTH_AND_HEIGHT): the box hugs the content on BOTH axes.
  // The inner div must size to its content (`max-content`) and never soft-wrap
  // (`white-space: pre`) so the ResizeObserver can read the natural width.
  const isAutoWidth = autoResizeMode === "WIDTH_AND_HEIGHT";
  // Overflow is user-selectable in EVERY mode via `textOverflow`. When unset we
  // fall back to the legacy mode-derived default (Fixed clips, Auto spills).
  // The auto axis never overflows (the box tracks content); this matters for
  // the manual axis (e.g. Auto-width with a user-shrunk height, or Fixed).
  const clipOverflow = a.textOverflow !== undefined ? a.textOverflow === "HIDDEN" : isFixed;
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
    // Auto-width hugs content (`max-content` + `pre`, no soft wrap); the other
    // modes fill the frame width (`100%` + `pre-wrap`) and wrap to it.
    width: isAutoWidth ? "max-content" : "100%",
    // The inner div is the element the auto-height ResizeObserver measures. As
    // a flex child of a frame-height container it would otherwise be SHRUNK to
    // the (short) container height — its border-box height would stay pinned
    // while only `scrollHeight` grew, so the observer never fires when content
    // grows by typing (a width change resizes the box and does fire it, which
    // is why edge-resize wrapping works but typing did not). Pin flex-shrink: 0
    // so the border-box height tracks content and the observer fires on growth.
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
    whiteSpace: isAutoWidth ? "pre" : "pre-wrap",
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
