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

import type { Item as AgocraftItem, TextRun } from "@agocraft/core";
import {
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSelection } from "../interactions/selection-context.js";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem, ItemFrame, TextAttrs } from "../types.js";
import { deriveTextAutoResize } from "./derive-text-auto-resize.js";

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

  // WI-040 — color / background may be a `StyleRef` (theme token) written
  // by the text-section picker when the user picked a theme swatch.
  // Resolve via the cascade hook so ancestor `style.provider` Units could
  // override the token; falls back to the raw string when no provider
  // context is mounted (tests / preview).
  const itemRef = item as unknown as AgocraftItem;
  const resolvedColor = useResolveColor(a.color, itemRef, undefined);
  const resolvedBg = useResolveColor(a.background, itemRef, undefined);

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
  // WI-029 / DR-016 — Fixed mode locks both dimensions. The ResizeObserver
  // must NOT auto-fit height in NONE; otherwise the user-set height would
  // be overwritten by content fit.
  //
  // WI-019 B4 / T3 Modify — the legacy `textAutoResize` field was removed
  // in agocraft schema v10. We derive the equivalent mode from
  // `attrs.layoutChild` via `deriveTextAutoResize` — see that helper for
  // the closed mapping table. Legacy designs migrate automatically when
  // loaded through Serializer.fromJSON({ migrations: [...] }).
  const autoResizeMode = deriveTextAutoResize(a.layoutChild);
  const autoResizeRef = useRef(autoResizeMode);
  autoResizeRef.current = autoResizeMode;

  useEffect(() => {
    const el = innerRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => {
      // Fixed mode: user controls width + height. Do not auto-update.
      if (autoResizeRef.current === "NONE") return;
      const measured = el.scrollHeight + 8;
      const frameEl = el.closest("[data-frame-id]");
      const parent = frameEl?.parentElement ?? null;
      if (parent === null) return;
      const parentH = parent.getBoundingClientRect().height;
      if (parentH <= 0) return;
      const newRatio = measured / parentH;
      const rounded = Math.round(newRatio * 10000) / 10000;
      // Compare against the LIVE doc height (`frameRef`) rather than the
      // last dispatched value. An earlier dispatch can be overwritten by
      // some other write (e.g. an explicit `weave.item.update` from the
      // host) and the observer would otherwise refuse to re-converge.
      if (Math.abs(rounded - frameRef.current.height) < 0.0005) return;
      onUpdateRef.current?.({
        frame: { ...frameRef.current, height: rounded },
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
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
  const truncate = isFixed && a.textTruncation === "ENDING";
  const containerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    // Fixed-mode + truncate: clip overflow. Auto-W/H: visible (ResizeObserver
    // catches up within one frame).
    overflow: isFixed ? "hidden" : "visible",
    display: "flex",
    flexDirection: "column",
    justifyContent,
    alignItems:
      horizontalAlign === "center"
        ? "center"
        : horizontalAlign === "right"
          ? "flex-end"
          : "stretch",
    padding: 4,
    ...(resolvedBg !== undefined ? { background: resolvedBg } : {}),
    opacity: a.opacity,
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
    width: "100%",
    fontFamily: a.fontFamily,
    fontSize: `${a.fontSize}px`,
    fontWeight: a.fontWeight,
    fontStyle: a.fontStyle,
    color: resolvedColor,
    textAlign: horizontalAlign,
    lineHeight: lineHeightValue,
    letterSpacing: `${a.letterSpacing}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textDecoration: decoration,
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
  const [isEditing, setIsEditing] = useState(false);
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
  const inner =
    editable && isEditing ? (
      <Suspense fallback={<>{renderReadOnly(a.text, a.textRuns)}</>}>
        <LexicalTextEditor
          anchorId={String(item.id)}
          value={a.text}
          {...(a.textRuns !== undefined ? { initialTextRuns: a.textRuns } : {})}
          onChange={(snapshot) => onUpdate?.({ text: snapshot.text, textRuns: snapshot.textRuns })}
          editable={editable}
        />
      </Suspense>
    ) : (
      <>{renderReadOnly(a.text, a.textRuns)}</>
    );
  const linked =
    !editable && a.hyperlink != null && a.hyperlink.url.length > 0 ? (
      <a
        href={a.hyperlink.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "inherit", textDecoration: "inherit" }}
      >
        {inner}
      </a>
    ) : (
      inner
    );

  return (
    <div
      ref={wrapRef}
      style={containerStyle}
      data-testid="text-block"
      onDoubleClick={(e) => {
        if (!editable) return;
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
      <div ref={innerRef} style={textStyle}>
        {linked}
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
function renderReadOnly(text: string, textRuns: ReadonlyArray<TextRun> | undefined): ReactNode {
  if (textRuns === undefined || textRuns.length === 0) return text;
  return textRuns.map((run, i) => {
    if (run.insert === "\n") return <br key={`br-${i}`} />;
    const attrs = run.attributes;
    if (attrs === undefined) {
      return <span key={i}>{run.insert}</span>;
    }
    const style: CSSProperties = {};
    if (attrs.fontWeight === "bold") style.fontWeight = "bold";
    if (attrs.fontStyle === "italic") style.fontStyle = "italic";
    if (attrs.color !== undefined) style.color = attrs.color;
    if (attrs.fontSize !== undefined) style.fontSize = `${attrs.fontSize}px`;
    if (attrs.fontFamily !== undefined) style.fontFamily = attrs.fontFamily;
    if (attrs.letterSpacing !== undefined) style.letterSpacing = `${attrs.letterSpacing}px`;
    if (attrs.textDecoration === "UNDERLINE") style.textDecoration = "underline";
    else if (attrs.textDecoration === "STRIKETHROUGH") style.textDecoration = "line-through";
    if (attrs.textCase === "UPPER") style.textTransform = "uppercase";
    else if (attrs.textCase === "LOWER") style.textTransform = "lowercase";
    else if (attrs.textCase === "TITLE") style.textTransform = "capitalize";
    return (
      <span key={i} style={style}>
        {run.insert}
      </span>
    );
  });
}
