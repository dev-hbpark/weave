// WI-023 Phase 15 + Phase 18 — text content View.
//
// WI-243 / DR-160 — split into ViewModel + pure View. ALL non-render concerns
// (attr/theme resolution, Figma-attr → CSS mapping, synchronous shrink-to-fit,
// the edit-mode FSM + effects, editor seed styles) now live in
// `text-item-view-model.ts`. This file is the PURE View (`TextView`, renders
// from `{ item, vm }` only — no Context, no derivation; only DOM refs + the
// lazy Lexical editor) plus a thin `TextBlock` shim that calls the hook.
// `TextView` is exported so the Phase-0 spec facet (HANDOFF-002) can wire
// `view: TextView` / `useViewModel: useTextItemViewModel` with no further edit.
//
// All typographic numbers are in DESIGN pixels; the camera/Stage transform
// scales the whole layer. DR-053 Stage 3 — PURE renderer: the agocraft layout
// engine OWNS all sizing; TextView just paints inside the engine-assigned box.

import type { TextRun } from "@agocraft/core";
import { type CSSProperties, lazy, type ReactNode, Suspense, useRef } from "react";
import type { AgoItem, TextAttrs, WeaveRunStyle } from "../types.js";
import { type TextItemVm, useTextItemViewModel } from "./text-item-view-model.js";

// R3 (WI-029 lazy-load): Lexical is ~55 KB gz of editor machinery. Defer until
// the user actually focuses a text box. Suspense's fallback matches the inner
// div's dimensions so layout doesn't jump.
const LexicalTextEditor = lazy(() =>
  import("./LexicalTextEditor.js").then((m) => ({ default: m.LexicalTextEditor })),
);

interface TextBlockProps {
  readonly item: AgoItem<"text">;
  readonly onUpdate?: (patch: Partial<TextAttrs>) => void;
}

/** Pure content View for a text item — renders from `{ item, vm }` ONLY. Owns no
 *  state/effects/derivation; only DOM refs (`data-text-content` is the element
 *  the selection chrome measures on the auto axis) and the lazy Lexical editor.
 *  Edit mode (Lexical) vs read-only render is chosen from `vm.isEditing`; the
 *  layered outline / hyperlink wrap are assembled from `vm` flags. */
export function TextView({
  item,
  vm,
}: {
  readonly item: AgoItem<"text">;
  readonly vm: TextItemVm;
}) {
  const a = item.attrs;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const inner =
    vm.editable && vm.isEditing ? (
      <Suspense fallback={renderReadOnly(a.text, a.textRuns)}>
        <LexicalTextEditor
          anchorId={String(item.id)}
          value={a.text}
          {...(Array.isArray(a.textRuns) ? { initialTextRuns: a.textRuns } : {})}
          {...(vm.baseInlineFormat !== undefined ? { baseInlineFormat: vm.baseInlineFormat } : {})}
          contentStyle={vm.editorContentStyle}
          baseRangeStyle={vm.baseRangeStyle}
          onChange={vm.onEditorChange}
          editable={vm.editable}
        />
      </Suspense>
    ) : (
      renderReadOnly(a.text, a.textRuns)
    );
  const linked =
    !vm.editable && a.hyperlink != null && a.hyperlink.url.length > 0 ? (
      // WI-090 (DR-052 §2) — raise the inline `<a>` above the item-level link
      // overlay (z-index 1) so clicking linked text opens the inline URL while
      // empty box area still fires the item-level link.
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
  // DR-059 / DR-060 — layered text outline: the same glyphs rendered TWICE, a
  // thick stroked back layer (absolute, behind) + the normal fill on top.
  const contentNode = vm.showOutline ? (
    <>
      <span aria-hidden="true" data-text-outline style={vm.outlineLayerStyle ?? undefined}>
        {renderReadOnly(a.text, a.textRuns, "outline", vm.hasOutline)}
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
      // While editing, always let the editor spill (overflow visible) so typed
      // text is never clipped regardless of `textOverflow`.
      style={vm.isEditing ? { ...vm.containerStyle, overflow: "visible" } : vm.containerStyle}
      data-testid="text-block"
      // DR-062 — while editing, the text surface is an extension of the open
      // contextual toolbar: a pointerdown / focus bounce here must NOT dismiss
      // the More popover.
      {...(vm.isEditing ? { "data-dismiss-exempt": "true", "data-weave-text-editor": "true" } : {})}
      onDoubleClick={(e) => {
        if (!vm.editable) return;
        e.stopPropagation();
        // Select first so the `isFrameSelected` gate (which keeps edit mode
        // alive) passes on the same interaction; the VM enters edit mode unless
        // the item is locked (DR-061).
        vm.onDoubleClick();
      }}
    >
      {/* `data-text-content` marks the live, content-sized element the selection
          chrome measures on the auto axis (FrameStage `boundsOf`). Shrink-to-fit:
          scale the (full-font) content down to fit its box — visual only
          (transform), so the authored font is never overwritten (reversible).
          `vm.fitScale` is computed SYNCHRONOUSLY from MODEL STATE (DR-053/WI-051),
          non-1 only for a box that genuinely cannot grow. */}
      <div
        ref={innerRef}
        data-text-content
        style={{
          ...(vm.showOutline ? { ...vm.textStyle, position: "relative" } : vm.textStyle),
          ...(vm.fitScale < 1 && !vm.isEditing
            ? { transform: `scale(${vm.fitScale})`, transformOrigin: vm.fitTransformOrigin }
            : {}),
        }}
      >
        {contentNode}
      </div>
    </div>
  );
}

/** Registered renderer (FrameSurface looks this up by `item.kind`). Thin shim:
 *  resolve the ViewModel, then render the pure View. WI-243 transitional — the
 *  Phase-0 spec facet will register `useViewModel`/`view` and derive the renderer
 *  via `makeKindRenderer`, retiring this shim. */
export function TextBlock({ item, onUpdate }: TextBlockProps) {
  const vm = useTextItemViewModel(item, onUpdate);
  return <TextView item={item} vm={vm} />;
}

/** Present-mode rich-text renderer. When `textRuns` is present, map each run to
 *  a `<span>` with inline style from PartialTextStyle. Otherwise fall back to the
 *  plain `text` projection (Phase 1 attrs shape).
 *
 *  Format precedence in present mode mirrors LexicalTextEditor's bitmask:
 *  UNDERLINE wins over STRIKETHROUGH when both are applied (shared CSS
 *  `text-decoration` slot). The block-level `textDecoration` is applied at the
 *  container (via vm.textStyle); per-run overrides win locally. */
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
