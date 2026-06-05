// WI-029 Phase 2 — Lexical-backed text editor for TextBlock.
//
// Replaces design-system EditableText (Phase 1 fallback) with Lexical's
// RichTextPlugin. Decision: DR-015 Accepted 2026-05-25 after PoC manual IME
// verification PASSed. Lexical is Meta-maintained, IME-stable for Korean,
// tree-shake-safe (3-gate BEST tier).
//
// Phase 2 scope (current file):
//   - RichText editing: Cmd+B / Cmd+I / Cmd+U work via Lexical's native
//     keyboard shortcuts. Per-range formatting is captured into textRuns.
//   - The host receives both `text` (plain join) and `textRuns` (rich shape)
//     on every change. Phase 2.5 will wire `textRuns` mutations to the
//     `item.text` Patch variant (Quill Delta) when SYNC_ENABLED=true.
//   - Single-click-to-type when editable; the TextBlock wrapper controls
//     editable=true/false based on present vs edit mode.
//
// StrictMode safety: `LexicalComposer.initialConfig` is `useMemo`-stable per
// (anchorId, text). The configured `editorState` initializer reads `text`
// once; subsequent updates flow through `OnChangePlugin`.

import type { PartialTextStyle, TextRun } from "@agocraft/core";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $getSelectionStyleValueForProperty, $patchStyleText } from "@lexical/selection";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $selectAll,
  $setSelection,
  type BaseSelection,
  type EditorState,
  type RangeSelection,
} from "lexical";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import {
  type ActiveTextStyle,
  clearActiveTextStyle,
  EMPTY_READOUT,
  type PropReadout,
  pushSelectionReadout,
  type SelectionStyleReadout,
  setActiveTextStyle,
} from "../active-text-style.js";
import { RANGE_STYLE_PROPS, rangeStyleProp } from "../range-style-registry.js";
import type { WeaveRunStyle } from "../types.js";

// DR-060 — defaults when enabling a per-range outline from one half of the
// control (a color pick with no width yet, or a width with no color).
const DEFAULT_OUTLINE_WIDTH = 2;
const DEFAULT_OUTLINE_COLOR = "#000000";
const STROKE_COLOR_PROP = "-webkit-text-stroke-color";
const STROKE_WIDTH_PROP = "-webkit-text-stroke-width";

// Lexical TextNode format bitmask (from lexical's `LexicalConstants`).
// We snapshot the bits here rather than import the constants — Lexical's
// public exports don't surface them, and the values are stable across
// versions (Quill Delta's format keys are derived from the same mask).
const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 1 << 1;
const FORMAT_STRIKETHROUGH = 1 << 2;
const FORMAT_UNDERLINE = 1 << 3;
// const FORMAT_CODE = 1 << 4;            // v2+
// const FORMAT_SUBSCRIPT = 1 << 5;       // v2+
// const FORMAT_SUPERSCRIPT = 1 << 6;     // v2+
// const FORMAT_HIGHLIGHT = 1 << 7;       // v2+

export interface RichTextSnapshot {
  /** Plain text — `\n`-joined paragraphs. Equivalent to legacy `attrs.text`. */
  readonly text: string;
  /** Per-run textRuns (Phase 2 schema). Empty when the editor has no content. */
  readonly textRuns: ReadonlyArray<TextRun>;
}

/** Change-detection signature for a snapshot. Must fold in BOTH the plain
 *  text AND the per-run formatting — a pure range-format change (e.g. select
 *  a word + Cmd+B) leaves `text` identical but mutates `textRuns`, and was
 *  previously dropped by a text-only guard (range formatting silently lost on
 *  edit exit). JSON of the runs captures insert + every attribute key, so any
 *  bold/italic/underline/color/size delta produces a new signature. */
export function snapshotSignature(snapshot: RichTextSnapshot): string {
  return JSON.stringify({ t: snapshot.text, r: snapshot.textRuns });
}

/** DR-060 — parse a TextNode's CSS-text `style` for the weave-managed per-range
 *  outline (`-webkit-text-stroke-*`). Returns the pair only when BOTH a color
 *  and a positive width are present (the applier always writes them together). */
function parseOutlineFromStyle(style: string): { color?: string; width?: number } {
  if (style.length === 0) return {};
  let color: string | undefined;
  let width: number | undefined;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop === STROKE_COLOR_PROP) color = value;
    else if (prop === STROKE_WIDTH_PROP) {
      const n = Number.parseFloat(value);
      if (!Number.isNaN(n)) width = n;
    }
  }
  return color !== undefined && width !== undefined && width > 0 ? { color, width } : {};
}

/** Parse a single CSS declaration's value out of a node's CSS-text `style`.
 *  Returns undefined when the property is absent. */
function cssDeclValue(style: string, prop: string): string | undefined {
  if (style.length === 0) return undefined;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    if (decl.slice(0, idx).trim().toLowerCase() === prop) return decl.slice(idx + 1).trim();
  }
  return undefined;
}

/** Project a TextNode's FORMAT bitmask AND its CSS-text `style` into the run's
 *  weave style. DR-062 — the per-range typography props (color / size / family /
 *  spacing / case) are read back via the shared registry; DR-060's paired
 *  outline is read from the same node style. */
function nodeToAttributes(format: number, style: string): WeaveRunStyle | undefined {
  const attrs: Record<string, unknown> = {};
  if ((format & FORMAT_BOLD) !== 0) attrs.fontWeight = "bold";
  if ((format & FORMAT_ITALIC) !== 0) attrs.fontStyle = "italic";
  // UNDERLINE wins over STRIKETHROUGH when both bits are set — single
  // CSS `text-decoration` slot per run. v2 can split into per-property
  // decoration once the host schema supports the combination.
  if ((format & FORMAT_UNDERLINE) !== 0) attrs.textDecoration = "UNDERLINE";
  else if ((format & FORMAT_STRIKETHROUGH) !== 0) attrs.textDecoration = "STRIKETHROUGH";
  // DR-062 — CSS-declaration props (color / fontSize / fontFamily /
  // letterSpacing / textCase) via the single registry (Rule 6).
  for (const p of RANGE_STYLE_PROPS) {
    const raw = cssDeclValue(style, p.cssProp);
    if (raw === undefined) continue;
    const value = p.fromCss(raw);
    if (value !== undefined) attrs[p.attrKey] = value;
  }
  // DR-060 — paired outline (`-webkit-text-stroke-*`).
  const outline = parseOutlineFromStyle(style);
  if (outline.color !== undefined) attrs.outlineColor = outline.color;
  if (outline.width !== undefined) attrs.outlineWidth = outline.width;
  return Object.keys(attrs).length > 0 ? (attrs as WeaveRunStyle) : undefined;
}

/** DR-062 — serialize a run's weave style back into a Lexical node CSS-text
 *  `style` string (the inverse of `nodeToAttributes` for the CSS-declaration
 *  props + the paired outline). Format-bitmask props (bold/italic/underline/
 *  strike) are applied separately via `toggleFormat`, not here. Used by the
 *  editor seed so edit re-entry round-trips per-range typography. */
function runStyleToNodeCss(attrs: WeaveRunStyle): string {
  const decls: string[] = [];
  for (const p of RANGE_STYLE_PROPS) {
    const css = p.toCss((attrs as Record<string, unknown>)[p.attrKey]);
    if (css !== null) decls.push(`${p.cssProp}: ${css}`);
  }
  const rs = attrs as { outlineColor?: string; outlineWidth?: number };
  if (rs.outlineColor !== undefined && rs.outlineWidth !== undefined && rs.outlineWidth > 0) {
    decls.push(`${STROKE_COLOR_PROP}: ${rs.outlineColor}`);
    decls.push(`${STROKE_WIDTH_PROP}: ${rs.outlineWidth}px`);
    decls.push("paint-order: stroke");
  }
  return decls.join("; ");
}

/** Convert the live Lexical EditorState into the weave / agocraft
 *  textRuns + flat text snapshot. Must be called inside `editorState.read()`.
 *  Paragraphs are joined with `\n` in the plain `text` projection; textRuns
 *  carry an explicit `{ insert: "\n" }` between paragraph boundaries. */
export function readSnapshot(): RichTextSnapshot {
  const runs: TextRun[] = [];
  const paragraphs: string[] = [];
  $getRoot()
    .getChildren()
    .forEach((paragraph, paragraphIdx) => {
      if (!$isParagraphNode(paragraph)) return;
      let line = "";
      paragraph.getChildren().forEach((node) => {
        if (!$isTextNode(node)) return;
        const text = node.getTextContent();
        if (text.length === 0) return;
        const attributes = nodeToAttributes(node.getFormat(), node.getStyle());
        runs.push(attributes !== undefined ? { insert: text, attributes } : { insert: text });
        line += text;
      });
      paragraphs.push(line);
      if (paragraphIdx < $getRoot().getChildrenSize() - 1) {
        runs.push({ insert: "\n" });
      }
    });
  return {
    text: paragraphs.join("\n"),
    textRuns: runs,
  };
}

/** On edit entry, focus the editor and select ALL text so the user can
 *  type over it immediately (Figma double-click-to-edit parity). Runs once
 *  per edit session — `LexicalComposer` creates the editor a single time,
 *  so `editor` is stable and this effect does not re-fire while typing. */
function AutoFocusSelectAllPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.focus(
      () => {
        editor.update(() => {
          $selectAll();
        });
      },
      { defaultSelection: "rootEnd" },
    );
  }, [editor]);
  return null;
}

/** DR-062 — compute the selection's per-property style readout for the toolbar
 *  to DISPLAY (multi vs single). Must run inside `editorState.read()`. Uses
 *  `$getSelectionStyleValueForProperty(sel, prop, base)` — Lexical returns the
 *  common value, the `base` (item default, for runs that don't override), or
 *  `""` when the range spans differing values (the canonical mixed signal).
 *  Passing the item base as the default is what lets a sub-range that is all
 *  base-styled read as a single value instead of "mixed". */
function buildReadout(
  sel: RangeSelection | null,
  base: Readonly<Record<string, string>>,
): SelectionStyleReadout {
  if (sel === null) return EMPTY_READOUT;
  const props: Record<string, PropReadout> = {};
  for (const p of RANGE_STYLE_PROPS) {
    const raw = $getSelectionStyleValueForProperty(sel, p.cssProp, base[p.cssProp] ?? "");
    if (raw === "") {
      props[p.attrKey] = { mixed: true };
    } else {
      const value = p.fromCss(raw);
      props[p.attrKey] = value === undefined ? { mixed: false } : { value, mixed: false };
    }
  }
  // Outline: no base bleed — per-range outline is independent of any whole-item
  // outline while editing. "" for color ⇒ none-or-mixed; we report mixed only
  // when there is some stroke in the range (a uniform width survives).
  const ocRaw = $getSelectionStyleValueForProperty(sel, STROKE_COLOR_PROP, "");
  const owRaw = $getSelectionStyleValueForProperty(sel, STROKE_WIDTH_PROP, "");
  const ow = Number.parseFloat(owRaw);
  const outline =
    ocRaw === "" && owRaw === ""
      ? { mixed: false }
      : ocRaw !== "" && !Number.isNaN(ow)
        ? { color: ocRaw, width: ow, mixed: false }
        : { mixed: true };
  return {
    hasRange: !sel.isCollapsed(),
    props,
    outline,
    bold: sel.hasFormat("bold"),
    italic: sel.hasFormat("italic"),
    underline: sel.hasFormat("underline"),
    strikethrough: sel.hasFormat("strikethrough"),
  };
}

/** DR-062 — register a per-range STYLE applier for this editor's item so the
 *  contextual toolbar can target the live SELECTION (color / size / family /
 *  spacing / case / decoration / outline) while editing, and DISPLAY the
 *  selection's current style. Generalizes DR-060's outline-only bridge.
 *
 *  Selection preservation: the toolbar's mousedown blurs the editor and
 *  collapses the DOM selection, which would make a patch a no-op. We snapshot
 *  the last selection made WHILE THE EDITOR HAD FOCUS — a range OR a caret — and
 *  restore it inside each applier `update`. A range styles that range; a caret
 *  sets the pending style so the NEXT typed text carries the property. The
 *  blur-collapse from the toolbar click is ignored, so it neither resurrects a
 *  cleared range nor discards a deliberately-placed caret. */
function TextStylePlugin({
  itemId,
  baseStyle,
}: {
  readonly itemId: string;
  readonly baseStyle: Readonly<Record<string, string>>;
}) {
  const [editor] = useLexicalComposerContext();
  const baseRef = useRef(baseStyle);
  baseRef.current = baseStyle;
  useEffect(() => {
    // The last selection made WHILE THE EDITOR HAD FOCUS — a range OR a
    // collapsed caret. This is the user's INTENT. The toolbar's mousedown blurs
    // the editor and the browser collapses the DOM selection; that blur-induced
    // change must NOT overwrite the intent (guarded by `editorIsFocused` below),
    // so a caret the user placed in-editor survives a toolbar click — and a
    // styled range is NOT resurrected once the user collapses it to a caret.
    let savedSelection: BaseSelection | null = null;
    // Remembered outline pair (each control sets one half; preserve the other).
    let lastOutlineColor = DEFAULT_OUTLINE_COLOR;
    let lastOutlineWidth = DEFAULT_OUTLINE_WIDTH;

    // The editor owns the DOM selection only while it is focused. A selection
    // change observed after focus moved to the toolbar is the blur artifact, not
    // the user's intent — so we don't capture it as the target.
    const editorIsFocused = (): boolean => {
      const root = editor.getRootElement();
      const active = typeof document !== "undefined" ? document.activeElement : null;
      return root !== null && active !== null && (root === active || root.contains(active));
    };

    // Push a fresh readout: the toolbar tracks the selection the NEXT apply
    // targets — the saved in-editor selection (range or caret), or the live one
    // before anything is saved. Also re-seeds the remembered outline pair.
    const readAndPushFrom = (state: EditorState): void => {
      state.read(() => {
        const live = $getSelection();
        // Capture the user's intent (range OR caret) while the editor is focused;
        // a blur artifact (focus on the toolbar) must not overwrite it.
        if ($isRangeSelection(live) && editorIsFocused()) savedSelection = live.clone();
        // Prefer the LIVE non-collapsed range (the user's in-editor selection,
        // and — after a per-range apply — the patched range). Fall back to the
        // saved intent when the live selection is a blur artifact (collapsed /
        // null because focus moved to the toolbar); finally a live caret.
        const sel =
          $isRangeSelection(live) && !live.isCollapsed()
            ? live
            : savedSelection !== null && $isRangeSelection(savedSelection)
              ? savedSelection
              : $isRangeSelection(live)
                ? live
                : null;
        if (sel !== null) {
          const c = $getSelectionStyleValueForProperty(sel, STROKE_COLOR_PROP, "");
          const w = Number.parseFloat(
            $getSelectionStyleValueForProperty(sel, STROKE_WIDTH_PROP, ""),
          );
          if (c.length > 0) lastOutlineColor = c;
          if (!Number.isNaN(w) && w > 0) lastOutlineWidth = w;
        }
        pushSelectionReadout(itemId, buildReadout(sel, baseRef.current));
      });
    };
    // Reads the CURRENT committed state — safe to call right after an
    // `editor.update` returns (the update is already committed by then).
    const computeAndPush = (): void => readAndPushFrom(editor.getEditorState());

    /** Apply `fn` to the user's intended selection (the last in-editor one),
     *  restoring it first. The selection may be COLLAPSED — `$patchStyleText`
     *  then sets the caret's pending style so the NEXT typed text carries the
     *  property; a real range styles that range.
     *
     *  `continuous` (slider drags) carries the `skip-dom-selection` tag so
     *  Lexical does NOT reconcile (and thus FOCUS) the contentEditable: a per-
     *  range apply otherwise yanked DOM focus to the editor, which interrupted a
     *  slider mid-drag (thumb lost focus → drag died / value stuck) and bounced
     *  focus out of the More popover (closing it). DISCRETE applies (default)
     *  reconcile normally so focus returns to the editor and the DOM selection
     *  follows any node split — needed for caret-then-type and for keeping a
     *  multi-run selection coherent after the patch. */
    const withSelection = (fn: (sel: RangeSelection) => void, continuous = false): void => {
      editor.update(
        () => {
          let sel = $getSelection();
          // Restore the saved intent ONLY when the live selection is unusable —
          // i.e. the toolbar blurred the editor and the browser collapsed it.
          // When the editor is focused with a real selection, use it directly:
          // re-setting an already-correct selection forces a DOM-selection
          // reconcile that COLLAPSES it (observed dropping a 3-char range to 1),
          // breaking a subsequent in-editor keyboard extend.
          if (!editorIsFocused() && savedSelection !== null) {
            const restored = savedSelection.clone();
            $setSelection(restored);
            sel = restored;
          }
          if ($isRangeSelection(sel)) {
            fn(sel);
            // Re-capture so the next drag step targets the (possibly re-split)
            // nodes; during a drag focus is on the toolbar, so SELECTION_CHANGE
            // won't refresh it for us.
            const after = $getSelection();
            if ($isRangeSelection(after)) savedSelection = after.clone();
          }
        },
        continuous ? { tag: "skip-dom-selection" } : undefined,
      );
      // For a continuous apply no DOM selectionchange fires (we skipped it), so
      // refresh the readout ourselves → controlled toolbar values (the slider
      // thumb) track the patch instead of lagging/sticking.
      computeAndPush();
    };

    const patchOutline = (
      color: string | null,
      width: number | null,
      continuous: boolean,
    ): void => {
      const on = color !== null && width !== null;
      withSelection((sel) => {
        $patchStyleText(sel, {
          [STROKE_COLOR_PROP]: color,
          [STROKE_WIDTH_PROP]: width !== null ? `${width}px` : null,
          "paint-order": on ? "stroke" : null,
        });
      }, continuous);
    };

    const applier: ActiveTextStyle = {
      itemId,
      setStyleProp: (attrKey, value, opts) => {
        const p = rangeStyleProp(attrKey);
        if (p === undefined) return;
        const css = value === undefined ? null : p.toCss(value);
        withSelection((sel) => {
          $patchStyleText(sel, { [p.cssProp]: css });
        }, opts?.continuous === true);
      },
      toggleFormat: (format) => {
        withSelection((sel) => {
          sel.formatText(format);
        });
      },
      // Outline COLOR is a discrete pick (ColorPicker commit) → reconcile.
      setOutlineColor: (color) => {
        lastOutlineColor = color;
        patchOutline(color, lastOutlineWidth, false);
      },
      // Outline WIDTH is a slider → continuous (keep focus on the thumb).
      setOutlineWidth: (width) => {
        if (width <= 0) {
          patchOutline(null, null, true);
          return;
        }
        lastOutlineWidth = width;
        patchOutline(lastOutlineColor, width, true);
      },
      clearOutline: () => patchOutline(null, null, false),
    };
    setActiveTextStyle(applier);

    // Use an update listener rather than SELECTION_CHANGE_COMMAND: the listener
    // delivers the NEW committed `editorState`, so reading the selection here is
    // never the stale current-state observed inside a command dispatch (which
    // made the readout non-deterministically lag the live DOM selection — a
    // multi-color range could read as a single color). Capturing the intent +
    // pushing the readout both live in `readAndPushFrom`.
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      readAndPushFrom(editorState);
    });
    // Initial push so the toolbar opens with the right readout.
    computeAndPush();

    return () => {
      unregister();
      clearActiveTextStyle(itemId);
    };
  }, [editor, itemId]);
  return null;
}

interface LexicalTextEditorProps {
  /** Current plain-text value (source of truth from host). */
  readonly value: string;
  /** Commit handler fired on every meaningful change. Receives both the
   *  flat text projection and per-run formatting. */
  readonly onChange: (snapshot: RichTextSnapshot) => void;
  /** Inert in present mode (editable=false), interactive in edit mode. */
  readonly editable: boolean;
  /** Placeholder shown when the editor is empty. */
  readonly placeholder?: string;
  /** Stable id for Lexical's namespace + StrictMode safety. */
  readonly anchorId: string;
  /** Initial textRuns to seed the editor with (if undefined, falls back to
   *  `value` as a single un-styled run). */
  readonly initialTextRuns?: ReadonlyArray<TextRun>;
  /** DR-057 — the item-level inline toggleables (the BLOCK BASE). Projected
   *  into the seed when falling back to plain `value` (no runs yet), so a box
   *  made bold/italic/underline via the toolbar opens in the editor with that
   *  formatting already on (and the first edit captures it into `textRuns`
   *  instead of dropping it). Ignored when `initialTextRuns` is authoritative. */
  readonly baseInlineFormat?: PartialTextStyle;
  /** Inline style passed to the ContentEditable (font/size/color/etc.). */
  readonly contentStyle?: CSSProperties;
  /** ARIA label for the editor surface. */
  readonly ariaLabel?: string;
  /** DR-062 — the item-level BASE for each per-range CSS property (keyed by CSS
   *  prop name: `color` / `font-size` / `font-family` / `letter-spacing` /
   *  `text-transform`). Used as the default in the selection readout so a
   *  sub-range whose runs DON'T override a property reads as that single base
   *  value (not "mixed"). Falls back to `contentStyle` when omitted. */
  readonly baseRangeStyle?: Readonly<Record<string, string>>;
}

/** Derive a per-range CSS base from the ContentEditable's inline style when an
 *  explicit `baseRangeStyle` isn't supplied (standalone hosts / tests). */
function baseRangeStyleFromContent(
  contentStyle: CSSProperties | undefined,
): Readonly<Record<string, string>> {
  if (contentStyle === undefined) return {};
  const out: Record<string, string> = {};
  if (typeof contentStyle.color === "string") out.color = contentStyle.color;
  if (contentStyle.fontSize !== undefined)
    out["font-size"] =
      typeof contentStyle.fontSize === "number"
        ? `${contentStyle.fontSize}px`
        : String(contentStyle.fontSize);
  if (typeof contentStyle.fontFamily === "string") out["font-family"] = contentStyle.fontFamily;
  if (contentStyle.letterSpacing !== undefined)
    out["letter-spacing"] =
      typeof contentStyle.letterSpacing === "number"
        ? `${contentStyle.letterSpacing}px`
        : String(contentStyle.letterSpacing);
  return out;
}

export function LexicalTextEditor({
  value,
  onChange,
  editable,
  placeholder = "텍스트 입력…",
  anchorId,
  initialTextRuns,
  baseInlineFormat,
  contentStyle,
  ariaLabel = "Text content",
  baseRangeStyle,
}: LexicalTextEditorProps) {
  const resolvedBaseRangeStyle = useMemo(
    () => baseRangeStyle ?? baseRangeStyleFromContent(contentStyle),
    [baseRangeStyle, contentStyle],
  );
  // useMemo — `initialConfig` must be stable across renders (Lexical
  // re-creates the editor whenever the config identity changes). Including
  // `value` in deps means an external `text` rewrite remounts the editor —
  // intentional (host snapshot updates flow through this path).
  const initialConfig = useMemo(
    () => ({
      namespace: `weave-text:${anchorId}`,
      editable,
      onError(error: Error) {
        console.error("[Lexical:TextBlock]", error);
        throw error;
      },
      editorState: () => {
        const root = $getRoot();
        if (root.getFirstChild() !== null) return; // already populated

        // Seed from `initialTextRuns` if available (Phase 2 rich text),
        // otherwise fall back to the plain `value` string carrying the
        // item-level BLOCK BASE (DR-057) so a toolbar-formatted box opens in
        // the editor with that formatting on. When runs are authoritative the
        // base is ignored — the runs already encode every range's format.
        const runs =
          initialTextRuns && initialTextRuns.length > 0
            ? initialTextRuns
            : value.length > 0
              ? ([
                  baseInlineFormat !== undefined
                    ? { insert: value, attributes: baseInlineFormat }
                    : { insert: value },
                ] as ReadonlyArray<TextRun>)
              : ([] as ReadonlyArray<TextRun>);

        let paragraph = $createParagraphNode();
        for (const run of runs) {
          // `{ insert: "\n" }` is a paragraph boundary in Quill Delta.
          if (run.insert === "\n") {
            root.append(paragraph);
            paragraph = $createParagraphNode();
            continue;
          }
          const textNode = $createTextNode(run.insert);
          // Apply formatting attributes → TextNode.format bitmask.
          if (run.attributes !== undefined) {
            if (run.attributes.fontWeight === "bold") textNode.toggleFormat("bold");
            if (run.attributes.fontStyle === "italic") textNode.toggleFormat("italic");
            if (run.attributes.textDecoration === "UNDERLINE") textNode.toggleFormat("underline");
            if (run.attributes.textDecoration === "STRIKETHROUGH")
              textNode.toggleFormat("strikethrough");
            // DR-062 — re-apply stored per-range CSS-declaration props (color /
            // size / family / spacing / case) AND the DR-060 paired outline as
            // the node style so edit re-entry round-trips (readSnapshot reads it
            // back via the same registry).
            const css = runStyleToNodeCss(run.attributes as WeaveRunStyle);
            if (css.length > 0) textNode.setStyle(css);
          }
          paragraph.append(textNode);
        }
        if (paragraph.getChildrenSize() > 0 || root.getChildrenSize() === 0) {
          root.append(paragraph);
        }
      },
      theme: {
        text: {
          bold: "font-bold",
          italic: "italic",
          underline: "underline",
          strikethrough: "line-through",
        },
      },
    }),
    [anchorId, editable, value, initialTextRuns, baseInlineFormat],
  );

  // Track the last committed snapshot SIGNATURE (text + per-run formatting) so
  // the OnChange handler doesn't fire redundant callbacks (Lexical fires on
  // every text node mutation) — while still committing pure range-format
  // changes that leave the plain text unchanged. Seed from the initial
  // text/runs so the first format-only edit is detected against the real
  // starting state, not an empty placeholder.
  const lastCommittedRef = useRef<string | null>(
    snapshotSignature({
      text: value,
      textRuns: initialTextRuns ?? (value.length > 0 ? [{ insert: value }] : []),
    }),
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            aria-label={ariaLabel}
            className="outline-none w-full"
            style={contentStyle}
          />
        }
        placeholder={
          <div
            className="pointer-events-none select-none text-gray-400"
            style={{ position: "absolute", top: 0, left: 0, ...contentStyle }}
          >
            {placeholder}
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <AutoFocusSelectAllPlugin />
      <TextStylePlugin itemId={anchorId} baseStyle={resolvedBaseRangeStyle} />
      <OnChangePlugin
        onChange={(editorState) => {
          editorState.read(() => {
            const snapshot = readSnapshot();
            // Compare the full signature (text + per-run formatting) so a pure
            // range-format change (e.g. Cmd+B on a selection, no text delta)
            // still commits. A text-only guard dropped these and the formatting
            // was lost on edit exit.
            const sig = snapshotSignature(snapshot);
            if (sig !== lastCommittedRef.current) {
              lastCommittedRef.current = sig;
              onChange(snapshot);
            }
          });
        }}
        ignoreSelectionChange
      />
    </LexicalComposer>
  );
}

// WI-029 follow-up — `FormatHotkeysPlugin` removed. Lexical core's
// internal `dispatchKeyDownCommand` (registered at
// COMMAND_PRIORITY_ROOT by `$internalRegisterRootElement`) already
// matches Cmd+B/I/U via `isExactShortcutMatch` (event.key first,
// event.code fallback for non-English IMEs) and dispatches the
// FORMAT_TEXT_COMMAND. Our custom plugin at NORMAL priority was
// running BEFORE that internal handler and short-circuiting B/I via
// `return true`, while Cmd+U happened to fall through differently
// per user observation. Letting Lexical own the entire shortcut
// matrix removes the divergence. The application can re-introduce
// keyboard handlers later only for shortcuts Lexical doesn't already
// own.
