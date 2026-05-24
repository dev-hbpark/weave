// WI-020 Phase 5 + WI-021 Phase 11 — ContextualToolbar (Canva-style bar).
//
// Selection-driven. Two modes:
//   • single selection → render the kind's full editor section.
//   • multi selection of same-kind items → render the same section, but
//     each control reads a *shared* value across the set. When values
//     diverge the control gains a "Mixed" badge; committing a new value
//     applies it to every selected item, after which the badge clears.
//
// Mixed-kind multi selections render nothing (no overlap of props to edit).
//
// Positioning is the host's responsibility — DesignPage places this with
// `position: absolute; top: 12px; left: 50%; transform: translateX(-50%)`.

import {
  Button,
  ColorPicker,
  ContextualToolbar as Bar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NumberSlider,
  SegmentedControl,
  Switch,
} from "@weave/design-system";
import type { Editor } from "@agocraft/editor";
import type {
  ImageAttrs,
  ImageFit,
  ShapeAttrs,
  ShapeSubKind,
  TextAlign,
  TextAttrs,
  TextStyle,
  TextWeight,
  VideoAttrs,
  VideoFit,
} from "@agocraft/core";
import type { ReactNode } from "react";

type ItemSnapshot = {
  readonly id: string;
  readonly kind: string;
  readonly attrs: Readonly<Record<string, unknown>>;
};

interface ContextualToolbarProps {
  readonly editor: Editor;
  /** Selected items. Length 0 + `designBackground` set → "design" variant
   *  with a single Background picker for the canvas. Length 1 → single-
   *  select section. Length ≥ 2 with all same kind → multi-select section
   *  with mixed indicators on diverging props. Length ≥ 2 with mixed kinds
   *  → no bar. */
  readonly selectedItems: ReadonlyArray<ItemSnapshot>;
  /** Open the host's MediaSrcDialog pre-filled with the current src for the
   *  selected image / video. Host owns the dialog (DesignPage). */
  readonly onEditMediaSrc?: (kind: "image" | "video", current: string) => void;
  /** Open the host's MediaSrcDialog to fill the selected shape with an
   *  image / video paint. Host owns dialog state + dispatch. */
  readonly onEditShapeFill?: (
    kind: "image" | "video",
    current: string,
  ) => void;
  /** When provided AND no items are selected, the toolbar mounts a single
   *  "Background" picker that edits the overall design background. */
  readonly designBackground?: string;
  readonly onChangeDesignBackground?: (color: string) => void;
}

const FIT_OPTIONS = [
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
] as const;

/** Curated font-family presets. The webfonts are loaded from Google Fonts
 *  in `apps/web/index.html`; each stack ends with a robust fallback so
 *  text renders even if the named family hasn't downloaded yet. */
const FONT_FAMILY_PRESETS = [
  {
    value:
      "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    label: "Inter",
  },
  {
    value:
      "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    label: "Noto Sans KR",
  },
  {
    value:
      "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
    label: "Playfair",
  },
  {
    value:
      "'Noto Serif KR', 'Source Han Serif K', Georgia, 'Apple SD Gothic Neo', serif",
    label: "Noto Serif KR",
  },
  {
    value:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    label: "JetBrains Mono",
  },
  {
    value:
      "'Caveat', 'Comic Sans MS', cursive",
    label: "Caveat",
  },
] as const;

function fontFamilyLabel(stack: string): string {
  const hit = FONT_FAMILY_PRESETS.find((p) => p.value === stack);
  if (hit !== undefined) return hit.label;
  // Custom value (set programmatically) — show the first family name.
  const first = stack.split(",")[0]?.replace(/['"]/g, "").trim() ?? stack;
  return first;
}

const SHAPE_SUB_KIND_OPTIONS = [
  { value: "rectangle", label: "▭" },
  { value: "ellipse", label: "◯" },
  { value: "line", label: "─" },
  { value: "arrow", label: "→" },
  { value: "triangle", label: "△" },
  { value: "star", label: "★" },
  { value: "polygon", label: "⬡" },
  { value: "heart", label: "♥" },
] as const;

/** Apply the same attrs patcher to every selected item id. Goes through the
 *  command pipeline so each item gets a real Patch and the history sees one
 *  transaction per item (the editor's TransactionRunner coalesces adjacent
 *  patches with the same `mergeKey` if the command provides one). */
function updateAll(
  editor: Editor,
  ids: ReadonlyArray<string>,
  patcher: (prev: { attrs: Readonly<Record<string, unknown>> }) => {
    attrs: Readonly<Record<string, unknown>>;
  },
): void {
  for (const id of ids) {
    editor.exec("weave.item.update", { itemId: id, patch: patcher });
  }
}

/** Pick a shared value across all items via `read`. Returns the value if
 *  every item agrees (compared by `eq`, default Object.is); returns the
 *  sentinel `MIXED` otherwise. */
const MIXED: unique symbol = Symbol("mixed");
type MixedOr<T> = T | typeof MIXED;
function sharedValue<T>(
  items: ReadonlyArray<ItemSnapshot>,
  read: (item: ItemSnapshot) => T,
  eq: (a: T, b: T) => boolean = Object.is,
): MixedOr<T> {
  if (items.length === 0) return MIXED;
  const first = read(items[0]!);
  for (let i = 1; i < items.length; i++) {
    if (!eq(first, read(items[i]!))) return MIXED;
  }
  return first;
}
function isMixed<T>(v: MixedOr<T>): v is typeof MIXED {
  return v === MIXED;
}

function MixedBadge({ visible }: { readonly visible: boolean }): JSX.Element | null {
  if (!visible) return null;
  return (
    <span
      data-testid="mixed-badge"
      className="ml-1 text-[10px] uppercase tracking-wider text-[color:var(--text-soft)] border border-[color:var(--surface-overlay-border)] rounded px-1 py-0.5"
      aria-label="Mixed values"
    >
      Mixed
    </span>
  );
}

export function ContextualToolbar({
  editor,
  selectedItems,
  onEditMediaSrc,
  onEditShapeFill,
  designBackground,
  onChangeDesignBackground,
}: ContextualToolbarProps): JSX.Element | null {
  // No selection — render the "design" variant (overall canvas background)
  // when the host wires the design-background callbacks. Otherwise hide.
  if (selectedItems.length === 0) {
    if (
      designBackground === undefined ||
      onChangeDesignBackground === undefined
    ) {
      return null;
    }
    return (
      <Bar
        aria-label="Design properties"
        data-testid="contextual-toolbar"
        data-kind="design"
      >
        <Bar.Section label="Background">
          <ColorPicker
            value={designBackground}
            onValueCommit={(v) => onChangeDesignBackground(v)}
            onValueChange={() => { /* commit-only */ }}
          />
        </Bar.Section>
      </Bar>
    );
  }

  // Same-kind only — multi-selection of mixed kinds hides the bar.
  const firstKind = selectedItems[0]!.kind;
  for (const it of selectedItems) {
    if (it.kind !== firstKind) return null;
  }
  const ids = selectedItems.map((it) => it.id);
  const multi = selectedItems.length > 1;

  let section: ReactNode = null;

  switch (firstKind) {
    case "image": {
      const fit = sharedValue<ImageFit>(
        selectedItems,
        (it) => (it.attrs as unknown as ImageAttrs).fit,
      );
      const opacity = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as ImageAttrs).opacity,
      );
      const borderRadius = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as ImageAttrs).borderRadius,
      );
      const src = sharedValue<string>(
        selectedItems,
        (it) => (it.attrs as unknown as ImageAttrs).src,
      );
      section = (
        <>
          <Bar.Section label="Source">
            <div className="inline-flex items-center">
              <Button
                variant="ghost"
                size="md"
                onClick={() =>
                  onEditMediaSrc?.(
                    "image",
                    isMixed(src) ? "" : src,
                  )
                }
                data-testid="image-edit-src"
                disabled={multi && isMixed(src)}
              >
                {isMixed(src)
                  ? "여러 소스"
                  : src
                    ? truncateUrl(src)
                    : "URL 입력…"}
              </Button>
              <MixedBadge visible={isMixed(src)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Fit">
            <div className="inline-flex items-center">
              <SegmentedControl<ImageFit>
                value={isMixed(fit) ? ("cover" as ImageFit) : fit}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, fit: v },
                  }))
                }
                options={FIT_OPTIONS as unknown as ReadonlyArray<{
                  value: ImageFit; label: string;
                }>}
                aria-label="Image fit"
              />
              <MixedBadge visible={isMixed(fit)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Opacity">
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
                suffix=""
                format={(v) => `${Math.round(v * 100)}%`}
                aria-label="Image opacity"
              />
              <MixedBadge visible={isMixed(opacity)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Border radius">
            <div className="inline-flex items-center">
              <NumberSlider
                value={isMixed(borderRadius) ? 0 : borderRadius}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, borderRadius: v },
                  }))
                }
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}`}
                aria-label="Border radius"
              />
              <MixedBadge visible={isMixed(borderRadius)} />
            </div>
          </Bar.Section>
        </>
      );
      break;
    }

    case "video": {
      const fit = sharedValue<VideoFit>(
        selectedItems,
        (it) => (it.attrs as unknown as VideoAttrs).fit,
      );
      const loop = sharedValue<boolean>(
        selectedItems,
        (it) => (it.attrs as unknown as VideoAttrs).loop,
      );
      const muted = sharedValue<boolean>(
        selectedItems,
        (it) => (it.attrs as unknown as VideoAttrs).muted,
      );
      const volume = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as VideoAttrs).volume,
      );
      const src = sharedValue<string>(
        selectedItems,
        (it) => (it.attrs as unknown as VideoAttrs).src,
      );
      section = (
        <>
          <Bar.Section label="Source">
            <div className="inline-flex items-center">
              <Button
                variant="ghost"
                size="md"
                onClick={() =>
                  onEditMediaSrc?.("video", isMixed(src) ? "" : src)
                }
                data-testid="video-edit-src"
                disabled={multi && isMixed(src)}
              >
                {isMixed(src)
                  ? "여러 소스"
                  : src
                    ? truncateUrl(src)
                    : "URL 입력…"}
              </Button>
              <MixedBadge visible={isMixed(src)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Fit">
            <div className="inline-flex items-center">
              <SegmentedControl<VideoFit>
                value={isMixed(fit) ? ("cover" as VideoFit) : fit}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, fit: v },
                  }))
                }
                options={FIT_OPTIONS as unknown as ReadonlyArray<{
                  value: VideoFit; label: string;
                }>}
                aria-label="Video fit"
              />
              <MixedBadge visible={isMixed(fit)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Loop">
            <div className="inline-flex items-center">
              <Switch
                checked={isMixed(loop) ? false : loop}
                onCheckedChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, loop: v },
                  }))
                }
              />
              <MixedBadge visible={isMixed(loop)} />
            </div>
          </Bar.Section>
          <Bar.Section label="Muted">
            <div className="inline-flex items-center">
              <Switch
                checked={isMixed(muted) ? false : muted}
                onCheckedChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, muted: v },
                  }))
                }
              />
              <MixedBadge visible={isMixed(muted)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Volume">
            <div className="inline-flex items-center">
              <NumberSlider
                value={isMixed(volume) ? 1 : volume}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, volume: v },
                  }))
                }
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
              />
              <MixedBadge visible={isMixed(volume)} />
            </div>
          </Bar.Section>
        </>
      );
      break;
    }

    case "shape": {
      const shape = sharedValue<ShapeSubKind>(
        selectedItems,
        (it) => (it.attrs as unknown as ShapeAttrs).shape,
      );
      const fillType = sharedValue<string>(
        selectedItems,
        (it) => (it.attrs as unknown as ShapeAttrs).fill.type,
      );
      const fillColor = sharedValue<string>(
        selectedItems,
        (it) => {
          const f = (it.attrs as unknown as ShapeAttrs).fill;
          return f.type === "solid" ? f.color : "#000000";
        },
      );
      const strokeColor = sharedValue<string>(
        selectedItems,
        (it) => {
          const s = (it.attrs as unknown as ShapeAttrs).stroke;
          return s?.paint.type === "solid" ? s.paint.color : "#000000";
        },
      );
      const opacity = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as ShapeAttrs).opacity,
      );
      const fillIsMediaUniform =
        !isMixed(fillType) && (fillType === "image" || fillType === "video");
      // For the media-chip variant we need a single src — only show the
      // chip when every selected item has the SAME media fill.
      const fillMediaSrc = sharedValue<string>(
        selectedItems,
        (it) => {
          const f = (it.attrs as unknown as ShapeAttrs).fill;
          return f.type === "image" || f.type === "video" ? f.src : "";
        },
      );

      section = (
        <>
          <Bar.Section label="Shape">
            <div className="inline-flex items-center">
              <SegmentedControl<ShapeSubKind>
                value={isMixed(shape) ? ("rectangle" as ShapeSubKind) : shape}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => {
                    const prevAttrs = prev.attrs as unknown as ShapeAttrs;
                    return {
                      attrs: {
                        ...prev.attrs,
                        shape: v,
                        subAttrs: defaultSubAttrsForKind(v, prevAttrs.subAttrs),
                      } as unknown as Readonly<Record<string, unknown>>,
                    };
                  })
                }
                options={SHAPE_SUB_KIND_OPTIONS as unknown as ReadonlyArray<{
                  value: ShapeSubKind; label: string;
                }>}
                aria-label="Shape sub-kind"
              />
              <MixedBadge visible={isMixed(shape)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Fill">
            {fillIsMediaUniform && !isMixed(fillMediaSrc) ? (
              // Every selected shape carries the same media fill — show
              // the chip with replace + clear.
              <div className="inline-flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() =>
                    onEditShapeFill?.(
                      fillType as "image" | "video",
                      fillMediaSrc,
                    )
                  }
                  data-testid="shape-fill-media-edit"
                  aria-label={
                    fillType === "image" ? "이미지 채우기 편집" : "비디오 채우기 편집"
                  }
                >
                  {fillType === "image" ? "🖼" : "▶"}&nbsp;
                  {truncateUrl(fillMediaSrc)}
                </Button>
                <Button
                  variant="subtle"
                  size="md"
                  onClick={() =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: {
                        ...prev.attrs,
                        fill: { type: "solid", color: "#cbd5f5" },
                      } as unknown as Readonly<Record<string, unknown>>,
                    }))
                  }
                  data-testid="shape-fill-clear"
                  aria-label="채우기 비우기"
                >
                  ×
                </Button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5">
                <ColorPicker
                  value={isMixed(fillColor) ? "#cccccc" : fillColor}
                  onValueCommit={(v) =>
                    updateAll(editor, ids, (prev) => ({
                      attrs: {
                        ...prev.attrs,
                        fill: { type: "solid", color: v },
                      } as unknown as Readonly<Record<string, unknown>>,
                    }))
                  }
                  onValueChange={() => { /* commit-only */ }}
                />
                <MixedBadge visible={isMixed(fillColor) || isMixed(fillType)} />
                <Button
                  variant="subtle"
                  size="md"
                  onClick={() => onEditShapeFill?.("image", "")}
                  data-testid="shape-fill-image"
                  aria-label="이미지로 채우기"
                  title="이미지로 채우기"
                >
                  🖼
                </Button>
                <Button
                  variant="subtle"
                  size="md"
                  onClick={() => onEditShapeFill?.("video", "")}
                  data-testid="shape-fill-video"
                  aria-label="비디오로 채우기"
                  title="비디오로 채우기"
                >
                  ▶
                </Button>
              </div>
            )}
          </Bar.Section>
          <Bar.Section label="Stroke">
            <div className="inline-flex items-center">
              <ColorPicker
                value={isMixed(strokeColor) ? "#cccccc" : strokeColor}
                onValueCommit={(v) =>
                  updateAll(editor, ids, (prev) => {
                    const prevAttrs = prev.attrs as unknown as ShapeAttrs;
                    const existingStroke = prevAttrs.stroke ?? {
                      paint: { type: "solid" as const, color: v },
                      width: 2,
                    };
                    return {
                      attrs: {
                        ...prev.attrs,
                        stroke: {
                          ...existingStroke,
                          paint: { type: "solid", color: v },
                        },
                      } as unknown as Readonly<Record<string, unknown>>,
                    };
                  })
                }
                onValueChange={() => { /* commit-only */ }}
              />
              <MixedBadge visible={isMixed(strokeColor)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Opacity">
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
              />
              <MixedBadge visible={isMixed(opacity)} />
            </div>
          </Bar.Section>
        </>
      );
      break;
    }

    case "text": {
      const fontFamily = sharedValue<string>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).fontFamily,
      );
      const fontSize = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).fontSize,
      );
      const fontWeight = sharedValue<TextWeight>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).fontWeight,
      );
      const fontStyle = sharedValue<TextStyle>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).fontStyle,
      );
      const color = sharedValue<string>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).color,
      );
      const background = sharedValue<string | undefined>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).background,
      );
      const textAlign = sharedValue<TextAlign>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).textAlign,
      );
      const opacity = sharedValue<number>(
        selectedItems,
        (it) => (it.attrs as unknown as TextAttrs).opacity,
      );
      const bgHasValue = !isMixed(background) && background !== undefined;
      section = (
        <>
          <Bar.Section label="Family">
            <div className="inline-flex items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="md"
                    data-testid="text-font-family-trigger"
                    style={{
                      fontFamily: isMixed(fontFamily)
                        ? undefined
                        : fontFamily,
                    }}
                  >
                    {isMixed(fontFamily)
                      ? "여러 폰트"
                      : fontFamilyLabel(fontFamily)}
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
          <Bar.Section label="Font">
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
              <MixedBadge
                visible={isMixed(fontWeight) || isMixed(fontStyle)}
              />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Size">
            <div className="inline-flex items-center">
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
              <MixedBadge visible={isMixed(fontSize)} />
            </div>
          </Bar.Section>
          <Bar.Divider />
          <Bar.Section label="Align">
            <div className="inline-flex items-center">
              <SegmentedControl<TextAlign>
                value={isMixed(textAlign) ? "left" : textAlign}
                onValueChange={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, textAlign: v },
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
          <Bar.Divider />
          <Bar.Section label="Color">
            <div className="inline-flex items-center">
              <ColorPicker
                value={isMixed(color) ? "#cccccc" : color}
                onValueCommit={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, color: v },
                  }))
                }
                onValueChange={() => { /* commit-only */ }}
              />
              <MixedBadge visible={isMixed(color)} />
            </div>
          </Bar.Section>
          <Bar.Section label="Background">
            <div className="inline-flex items-center gap-1.5">
              <ColorPicker
                value={
                  isMixed(background)
                    ? "#cccccc"
                    : (background ?? "#ffffff")
                }
                onValueCommit={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: { ...prev.attrs, background: v },
                  }))
                }
                onValueChange={() => { /* commit-only */ }}
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
          <Bar.Section label="Opacity">
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
      break;
    }

    case "slide":
    case "canvas-design":
    case "block-doc":
    case "media": {
      // Per-frame background — same multi-aware ColorPicker pattern. The
      // attr is `attrs.background` (CSS color string, undefined = transparent).
      const background = sharedValue<string | undefined>(
        selectedItems,
        (it) =>
          (it.attrs as unknown as { background?: string }).background,
      );
      const bgHasValue = !isMixed(background) && background !== undefined;
      section = (
        <>
          <Bar.Section label="Background">
            <div className="inline-flex items-center gap-1.5">
              <ColorPicker
                value={
                  isMixed(background)
                    ? "#cccccc"
                    : (background ?? "#ffffff")
                }
                onValueCommit={(v) =>
                  updateAll(editor, ids, (prev) => ({
                    attrs: {
                      ...prev.attrs,
                      background: v,
                    } as unknown as Readonly<Record<string, unknown>>,
                  }))
                }
                onValueChange={() => { /* commit-only */ }}
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
                  data-testid="frame-bg-clear"
                  aria-label="배경 비우기"
                  title="배경 비우기 (투명)"
                >
                  ×
                </Button>
              ) : null}
            </div>
          </Bar.Section>
        </>
      );
      break;
    }

    default:
      // Unknown kind — nothing to edit.
      return null;
  }

  return (
    <Bar
      aria-label={`${firstKind} properties${multi ? ` (${selectedItems.length})` : ""}`}
      data-testid="contextual-toolbar"
      data-kind={firstKind}
      data-multi={multi ? "true" : undefined}
      data-count={selectedItems.length}
    >
      {section}
    </Bar>
  );
}

/** Visual-truncate URL to fit the toolbar (long URLs would blow up the bar). */
function truncateUrl(url: string): string {
  if (url.length <= 24) return url;
  return `…${url.slice(url.length - 22)}`;
}

function defaultSubAttrsForKind(
  next: ShapeSubKind,
  prev: ShapeAttrs["subAttrs"],
): ShapeAttrs["subAttrs"] {
  if (prev.shape === next) return prev;
  switch (next) {
    case "rectangle":
      return { shape: "rectangle", cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 } };
    case "ellipse":
      return { shape: "ellipse" };
    case "line":
      return { shape: "line" };
    case "arrow":
      return { shape: "arrow", heads: { start: "none", end: "triangle" }, headSize: 12 };
    case "triangle":
      return { shape: "triangle", variant: "equilateral" };
    case "star":
      return { shape: "star", points: 5, innerRatio: 0.5 };
    case "polygon":
      return { shape: "polygon", sides: 6 };
    case "path":
      return { shape: "path", d: "" };
    case "speech-bubble":
      return {
        shape: "speech-bubble",
        tail: { anchorX: 0.2, anchorY: 1, direction: "down" },
        cornerRadius: 8,
      };
    case "heart":
      return { shape: "heart", variant: "classic" };
  }
}
