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

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { PartialTextStyle, TextRun } from "@agocraft/core";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
} from "lexical";
import { type CSSProperties, useMemo, useRef } from "react";

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

interface RichTextSnapshot {
  /** Plain text — `\n`-joined paragraphs. Equivalent to legacy `attrs.text`. */
  readonly text: string;
  /** Per-run textRuns (Phase 2 schema). Empty when the editor has no content. */
  readonly textRuns: ReadonlyArray<TextRun>;
}

function formatToAttributes(format: number): PartialTextStyle | undefined {
  const attrs: {
    fontWeight?: "bold";
    fontStyle?: "italic";
    textDecoration?: "UNDERLINE" | "STRIKETHROUGH";
  } = {};
  if ((format & FORMAT_BOLD) !== 0) attrs.fontWeight = "bold";
  if ((format & FORMAT_ITALIC) !== 0) attrs.fontStyle = "italic";
  // UNDERLINE wins over STRIKETHROUGH when both bits are set — single
  // CSS `text-decoration` slot per run. v2 can split into per-property
  // decoration once the host schema supports the combination.
  if ((format & FORMAT_UNDERLINE) !== 0) attrs.textDecoration = "UNDERLINE";
  else if ((format & FORMAT_STRIKETHROUGH) !== 0) attrs.textDecoration = "STRIKETHROUGH";
  return Object.keys(attrs).length > 0 ? (attrs as PartialTextStyle) : undefined;
}

/** Convert the live Lexical EditorState into the weave / agocraft
 *  textRuns + flat text snapshot. Must be called inside `editorState.read()`.
 *  Paragraphs are joined with `\n` in the plain `text` projection; textRuns
 *  carry an explicit `{ insert: "\n" }` between paragraph boundaries. */
function readSnapshot(): RichTextSnapshot {
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
        const attributes = formatToAttributes(node.getFormat());
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
  /** Inline style passed to the ContentEditable (font/size/color/etc.). */
  readonly contentStyle?: CSSProperties;
  /** ARIA label for the editor surface. */
  readonly ariaLabel?: string;
}

export function LexicalTextEditor({
  value,
  onChange,
  editable,
  placeholder = "텍스트 입력…",
  anchorId,
  initialTextRuns,
  contentStyle,
  ariaLabel = "Text content",
}: LexicalTextEditorProps) {
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
        // otherwise fall back to the plain `value` string.
        const runs =
          initialTextRuns && initialTextRuns.length > 0
            ? initialTextRuns
            : value.length > 0
              ? ([{ insert: value }] as ReadonlyArray<TextRun>)
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
    [anchorId, editable, value, initialTextRuns],
  );

  // Track the last committed value so the OnChange handler doesn't fire
  // redundant onChange callbacks (Lexical fires on every text node mutation).
  const lastCommittedRef = useRef(value);
  lastCommittedRef.current = value;

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
      <OnChangePlugin
        onChange={(editorState) => {
          editorState.read(() => {
            const snapshot = readSnapshot();
            if (snapshot.text !== lastCommittedRef.current) {
              lastCommittedRef.current = snapshot.text;
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
