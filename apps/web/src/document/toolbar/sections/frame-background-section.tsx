// DR-design-015 — frame kind in Tier-2 layout.
// WI-020 / WI-043 — layout-type SegmentedControl (Absolute / Flex / Grid).
//
// Frame surface in the ContextualToolbar:
//   1. Background color (existing) — single color swatch + (optional) clear
//   2. Layout type (new) — SegmentedControl with 3 icons. Sets
//      `attrs.layout` via the dedicated `weave.frame.setLayout` command
//      (item.layout Patch — self-inverting, mergeKey-folded across rapid
//      flips, weave's reducer mirrors into doc state, cross-client safe).
//
// Mixed-selection behaviour: when frames with different layout kinds are
// selected, the SegmentedControl shows the Mixed badge and no option is
// active. Picking a value applies it to every selected frame.
//
// Motion (RISK-002 C2.3 / cubic-bezier symmetric P2.X = 1 - P1.X for
// perceived-speed feedback): the SegmentedControl itself uses the design-
// system motion tokens; the frame's children re-layout in their own
// renderer transition (host-tuned via CSS variables).

import {
  type AutoFlexSpec,
  type AutoGridSpec,
  createAutoFlexSpec,
  createAutoGridSpec,
  FILL_UNIT_KIND,
  type FlexAlign,
  type FlexDirection,
  type FlexJustify,
  type GridAlign,
  type GridJustify,
  type LayoutSpec,
  trackFr,
} from "@agocraft/core";
import {
  Accordion,
  AccordionItem,
  AlignmentPad,
  ContextualToolbar as Bar,
  Button,
  type TrackSize as DSTrackSize,
  GridSizePicker,
  IconClose,
  IconFrame,
  IconLayoutAbsolute,
  IconLayoutFlex,
  IconLayoutGrid,
  NumberSlider,
  SegmentedControl,
  Select,
  Switch,
  TrackSizeEditor,
} from "@weave/design-system";
import { type ReactElement, useState } from "react";
import { absoluteFrameBox } from "../../agocraft-mirror.js";
import { useDesignDims } from "../../style/resolver-context.js";
import { batchPerItem } from "../multi-edit.js";
import { FlipControls } from "./flip-controls.js";
import { FillControl, StrokeControl } from "./shadow-controls.js";
import type { ToolbarSectionComponent } from "./types.js";

type LayoutKindChoice = "absolute" | "auto-flex" | "auto-grid";

const LAYOUT_OPTIONS: ReadonlyArray<{
  readonly value: LayoutKindChoice;
  readonly label: string;
  readonly icon: React.ReactNode;
}> = [
  { value: "absolute", label: "Absolute", icon: <IconLayoutAbsolute size={14} /> },
  { value: "auto-flex", label: "Flex", icon: <IconLayoutFlex size={14} /> },
  { value: "auto-grid", label: "Grid", icon: <IconLayoutGrid size={14} /> },
];

/** Map an existing `attrs.layout` value to the SegmentedControl's value
 *  domain. Unknown / absent layout → "absolute" (the sentinel for "no
 *  policy attached"). Future LayoutKinds the toolbar doesn't know about
 *  fall back to "absolute" (graceful — host can extend the options). */
function deriveLayoutChoice(spec: LayoutSpec | undefined): LayoutKindChoice {
  if (spec === undefined) return "absolute";
  if (spec.kind === "auto-flex") return "auto-flex";
  if (spec.kind === "auto-grid") return "auto-grid";
  return "absolute";
}

/** Build the default LayoutSpec for a given choice. The SegmentedControl
 *  always materialises a "sensible" spec; the PropertiesPanel lets the
 *  user fine-tune (direction, gap, justify, align, padding, tracks, …). */
function specForChoice(choice: LayoutKindChoice): LayoutSpec | undefined {
  if (choice === "auto-flex") return createAutoFlexSpec();
  if (choice === "auto-grid")
    return createAutoGridSpec({ columns: [trackFr(1)], rows: [trackFr(1)] });
  return undefined; // "absolute"
}

/** Reconcile a track array to an exact COUNT — used by the GridSizePicker
 *  drag-matrix. Preserve existing track sizes; append `fr(1)` for new tracks;
 *  truncate extras. (Per-track fine sizing stays in the "트랙 세부" editor.) */
function resizeTracks(tracks: AutoGridSpec["columns"], count: number): AutoGridSpec["columns"] {
  if (count <= tracks.length) return tracks.slice(0, count);
  const out = tracks.slice();
  while (out.length < count) out.push(trackFr(1));
  return out;
}

// AlignmentPad axis triple (start / center / end). The pad covers the 9 core
// combinations; the extra options live in supplementary controls beside it:
//   • align "stretch" → a Switch
//   • flex justify "space-between / space-around" → a Select
const ALIGN_TRIPLE = ["start", "center", "end"] as const;

const FLEX_DISTRIBUTION_OPTIONS = [
  { value: "none", label: "분포 없음" },
  { value: "space-between", label: "사이 띄움" },
  { value: "space-around", label: "둘레 띄움" },
  { value: "space-evenly", label: "균등 띄움" },
] as const;
type FlexDistribution = (typeof FLEX_DISTRIBUTION_OPTIONS)[number]["value"];

/** justify values that the distribution Select owns (vs. the AlignmentPad). */
const FLEX_DISTRIBUTION_VALUES = ["space-between", "space-around", "space-evenly"] as const;

/** align-content distribution of wrapped lines (CSS align-content). */
const FLEX_ALIGN_CONTENT_OPTIONS = [
  { value: "start", label: "시작" },
  { value: "center", label: "가운데" },
  { value: "end", label: "끝" },
  { value: "stretch", label: "늘이기" },
  { value: "space-between", label: "사이 띄움" },
  { value: "space-around", label: "둘레 띄움" },
  { value: "space-evenly", label: "균등 띄움" },
] as const;

const GRID_AUTO_FLOW_OPTIONS = [
  { value: "row", label: "행 우선" },
  { value: "column", label: "열 우선" },
] as const;

const FLEX_DIRECTION_OPTIONS: ReadonlyArray<{ value: FlexDirection; label: string }> = [
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
];

const PADDING_SIDES = ["top", "right", "bottom", "left"] as const;
const PADDING_LABEL: Record<(typeof PADDING_SIDES)[number], string> = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

/** Padding 4-side sub-form. Shared by Flex + Grid Bar.More. WI-220 — values are
 *  DESIGN PX (px-first + ratio mirror, consistent with the WI-219 canvas handles
 *  and the WI-043 engine); the host computes px from each side's ratio × frame box.
 *
 *  WI-221 — a "개별" (individual) Switch toggles between a LINKED single control
 *  (one value → all 4 sides, `onAllChange`) and the per-side 4 controls. Default
 *  follows the data: linked when all 4 sides already match, else individual. */
function PaddingFields({
  pxOf,
  max,
  onSideChange,
  onAllChange,
}: {
  readonly pxOf: (side: (typeof PADDING_SIDES)[number]) => number;
  readonly max: number;
  readonly onSideChange: (side: (typeof PADDING_SIDES)[number], px: number) => void;
  readonly onAllChange: (px: number) => void;
}): ReactElement {
  const sidesEqual =
    pxOf("top") === pxOf("right") &&
    pxOf("right") === pxOf("bottom") &&
    pxOf("bottom") === pxOf("left");
  const [individual, setIndividual] = useState(() => !sidesEqual);
  return (
    <Bar.Field label="여백">
      <div className="flex flex-col gap-1.5 w-full" data-testid="frame-layout-padding">
        <span className="flex items-center gap-1.5 self-end text-[11px] text-[color:var(--text-overlay-soft)]">
          <Switch
            checked={individual}
            onCheckedChange={setIndividual}
            aria-label="개별 여백"
            data-testid="frame-padding-individual-toggle"
          />
          개별
        </span>
        {!individual ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[color:var(--text-overlay-soft)] w-12 shrink-0">
              All
            </span>
            <NumberSlider
              value={pxOf("top")}
              onValueChange={onAllChange}
              min={0}
              max={max}
              step={1}
              suffix="px"
              aria-label="Padding all"
              className="flex-1"
            />
          </div>
        ) : (
          PADDING_SIDES.map((side) => (
            <div key={side} className="flex items-center gap-2">
              <span className="text-[11px] text-[color:var(--text-overlay-soft)] w-12 shrink-0">
                {PADDING_LABEL[side]}
              </span>
              <NumberSlider
                value={pxOf(side)}
                onValueChange={(v) => onSideChange(side, v)}
                min={0}
                max={max}
                step={1}
                suffix="px"
                aria-label={`Padding ${side}`}
                className="flex-1"
              />
            </div>
          ))
        )}
      </div>
    </Bar.Field>
  );
}

export const FrameBackgroundSection: ToolbarSectionComponent = ({
  editor,
  items,
  ids,
  document,
}) => {
  // WI-220 — px-first gap/padding authoring needs the design plane (px↔ratio).
  const dims = useDesignDims();
  // WI-095 follow-up — a frame's background is a `decoration.fill` UNIT now
  // (DR-028 parity with shapes), not `attrs.background`. The same FillControl /
  // StrokeControl shapes use edit it, so frames get solid / gradient fills and
  // borders through one machinery. A clear (×) resets the fill unit to
  // transparent.
  const clearFill = () => {
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", { itemId: id, kind: FILL_UNIT_KIND, attrs: null });
    }
  };

  // Mixed-aware layout-type detection. Walk each selected item's
  // `attrs.layout` and compare derived choice. If they disagree → Mixed.
  const layoutChoices = items.map((it) =>
    deriveLayoutChoice((it.attrs as { layout?: LayoutSpec }).layout),
  );
  const firstLayoutChoice = layoutChoices[0] ?? "absolute";
  const layoutMixed = layoutChoices.some((c) => c !== firstLayoutChoice);

  const onLayoutChange = (next: LayoutKindChoice) => {
    const nextSpec = specForChoice(next);
    // Apply to every selected item via the dedicated layout command. The
    // per-item mergeKey only folds rapid flips on the SAME frame; `batchPerItem`
    // groups a multi-frame change into one undo entry (single id runs directly).
    batchPerItem(editor, ids, (id) =>
      editor.exec("weave.frame.setLayout", { itemId: id, layout: nextSpec }),
    );
  };

  // PropertiesPanel-style advanced fields (RISK-002 C4.2 — wrapped in
  // Bar.Field / design-system primitives for a11y). The "active" spec is
  // the first selected item's layout when all selected frames share the
  // same layout kind; mixed selections hide the fields and render a Mixed
  // notice. v1.1 ships the most-used controls (direction/gap/justify/align
  // for Flex; columnGap/rowGap/justify/align for Grid). TrackSizeEditor +
  // padding 4-side + alignSelf/justifySelf land in a follow-up PR (Triage
  // Step 3 Grew for the editor itself).
  const firstItem = items[0];
  const homogeneousSpec: LayoutSpec | undefined =
    !layoutMixed && firstItem !== undefined
      ? (firstItem.attrs as { layout?: LayoutSpec }).layout
      : undefined;

  const patchLayoutSpec = (next: LayoutSpec) => {
    batchPerItem(editor, ids, (id) =>
      editor.exec("weave.frame.setLayout", { itemId: id, layout: next }),
    );
  };

  // ── WI-220 px-first gap/padding (DR-139) ───────────────────────────────────
  // Author the px field directly + mirror the ratio (px ÷ frame absolute px), and
  // thread design dims so the engine reflows at fixed px (WI-043 P6). Per-frame in
  // multi-select (each frame has its own box). `dims === null` (no design plane) ⇒
  // fall back to the legacy ratio sliders is not needed: px display reads 0 and the
  // writer keeps the prior ratio.
  const dimsInput = dims !== null ? { designWidth: dims.width, designHeight: dims.height } : {};
  const specOf = (id: string): LayoutSpec | undefined =>
    (items.find((it) => String(it.id) === id)?.attrs as { layout?: LayoutSpec } | undefined)
      ?.layout;
  const boxOf = (id: string): { w: number; h: number } | null => {
    if (dims === null) return null;
    const b = absoluteFrameBox(document, id, dims.width, dims.height);
    return b !== null ? { w: b.w, h: b.h } : null;
  };
  const firstBox = firstItem !== undefined ? boxOf(String(firstItem.id)) : null;

  /** Patch one px-authored layout change across the selection, per-frame. */
  const patchPx = (build: (spec: LayoutSpec, box: { w: number; h: number } | null) => LayoutSpec) =>
    batchPerItem(editor, ids, (id) => {
      const spec = specOf(id);
      if (spec === undefined) return;
      editor.exec("weave.frame.setLayout", {
        itemId: id,
        layout: build(spec, boxOf(id)),
        ...dimsInput,
      });
    });

  const setFlexGapPx = (px: number) =>
    patchPx((spec, box) => {
      if (spec.kind !== "auto-flex") return spec;
      const mainPx = box !== null ? (spec.direction === "row" ? box.w : box.h) : 0;
      const ratio = mainPx > 0 ? px / mainPx : spec.gap;
      return { ...spec, gap: ratio, gapPx: px };
    });
  const setGridGapPx = (axis: "column" | "row", px: number) =>
    patchPx((spec, box) => {
      if (spec.kind !== "auto-grid") return spec;
      const axisPx = box !== null ? (axis === "column" ? box.w : box.h) : 0;
      const ratio = axisPx > 0 ? px / axisPx : axis === "column" ? spec.columnGap : spec.rowGap;
      return axis === "column"
        ? { ...spec, columnGap: ratio, columnGapPx: px }
        : { ...spec, rowGap: ratio, rowGapPx: px };
    });
  const setPaddingSidePx = (side: "top" | "right" | "bottom" | "left", px: number) =>
    patchPx((spec, box) => {
      if (!("padding" in spec)) return spec;
      const horizontal = side === "left" || side === "right";
      const axisPx = box !== null ? (horizontal ? box.w : box.h) : 0;
      const ratio = axisPx > 0 ? px / axisPx : spec.padding[side];
      const curPx = spec.paddingPx ?? {
        top: spec.padding.top * (box?.h ?? 0),
        right: spec.padding.right * (box?.w ?? 0),
        bottom: spec.padding.bottom * (box?.h ?? 0),
        left: spec.padding.left * (box?.w ?? 0),
      };
      return {
        ...spec,
        padding: { ...spec.padding, [side]: ratio },
        paddingPx: { ...curPx, [side]: px },
      };
    });
  // WI-221 — linked padding: one px → all 4 sides (per-axis ratio mirror).
  const setAllPaddingPx = (px: number) =>
    patchPx((spec, box) => {
      if (!("padding" in spec)) return spec;
      const rx = box !== null && box.w > 0 ? px / box.w : spec.padding.left;
      const ry = box !== null && box.h > 0 ? px / box.h : spec.padding.top;
      return {
        ...spec,
        padding: { top: ry, right: rx, bottom: ry, left: rx },
        paddingPx: { top: px, right: px, bottom: px, left: px },
      };
    });

  // px display values from the homogeneous (shared) spec + first frame's box.
  const round = (n: number): number => Math.round(n);
  const flexMainPx =
    homogeneousSpec?.kind === "auto-flex" && firstBox !== null
      ? homogeneousSpec.direction === "row"
        ? firstBox.w
        : firstBox.h
      : 0;
  const flexGapPxDisplay =
    homogeneousSpec?.kind === "auto-flex"
      ? round(homogeneousSpec.gapPx ?? homogeneousSpec.gap * flexMainPx)
      : 0;
  const gridColGapPxDisplay =
    homogeneousSpec?.kind === "auto-grid"
      ? round(homogeneousSpec.columnGapPx ?? homogeneousSpec.columnGap * (firstBox?.w ?? 0))
      : 0;
  const gridRowGapPxDisplay =
    homogeneousSpec?.kind === "auto-grid"
      ? round(homogeneousSpec.rowGapPx ?? homogeneousSpec.rowGap * (firstBox?.h ?? 0))
      : 0;
  const paddingPxOf = (side: "top" | "right" | "bottom" | "left"): number => {
    if (homogeneousSpec === undefined || !("padding" in homogeneousSpec)) return 0;
    const px = homogeneousSpec.paddingPx?.[side];
    if (px !== undefined) return round(px);
    const axisPx = side === "left" || side === "right" ? (firstBox?.w ?? 0) : (firstBox?.h ?? 0);
    return round(homogeneousSpec.padding[side] * axisPx);
  };
  // px slider ceilings (≈ the old ratio caps × the frame box).
  const gapMax = round(Math.max(80, flexMainPx * 0.5));
  const colGapMax = round(Math.max(80, (firstBox?.w ?? 0) * 0.5));
  const rowGapMax = round(Math.max(80, (firstBox?.h ?? 0) * 0.5));
  const padMax = round(
    Math.max(80, Math.min(firstBox?.w ?? Infinity, firstBox?.h ?? Infinity) * 0.45),
  );

  const onFlexFieldChange = <K extends keyof AutoFlexSpec>(key: K, value: AutoFlexSpec[K]) => {
    if (homogeneousSpec?.kind !== "auto-flex") return;
    patchLayoutSpec({ ...homogeneousSpec, [key]: value } as AutoFlexSpec);
  };

  const onGridFieldChange = <K extends keyof AutoGridSpec>(key: K, value: AutoGridSpec[K]) => {
    if (homogeneousSpec?.kind !== "auto-grid") return;
    patchLayoutSpec({ ...homogeneousSpec, [key]: value } as AutoGridSpec);
  };

  // AlignmentPad sets BOTH axes in one patch — calling the single-field
  // helpers twice would race (the 2nd reads the pre-change spec and reverts
  // the 1st). One spread, one command.
  const onFlexAlignPad = (justify: FlexJustify, align: FlexAlign) => {
    if (homogeneousSpec?.kind !== "auto-flex") return;
    patchLayoutSpec({ ...homogeneousSpec, justify, align });
  };
  const onGridAlignPad = (justify: GridJustify, align: GridAlign) => {
    if (homogeneousSpec?.kind !== "auto-grid") return;
    patchLayoutSpec({ ...homogeneousSpec, justify, align });
  };

  return (
    <>
      <Bar.Kind icon={<IconFrame size={18} />} label="프레임" />
      <Bar.Quick>
        <div className="inline-flex items-center gap-1">
          {/* DR-028 parity — fill + stroke as decoration UNITS (solid /
              gradient via the ColorPicker; image/video fill lands via the
              agent or a child media item). Same controls shapes use. */}
          <FillControl editor={editor} ids={ids} />
          <StrokeControl editor={editor} ids={ids} compact />
          <Button
            variant="subtle"
            size="md"
            onClick={clearFill}
            data-testid="frame-bg-clear"
            aria-label="배경 비우기"
            data-tip="배경 비우기 (투명)"
          >
            <IconClose size={14} />
          </Button>
        </div>
        <div
          className="inline-flex items-center gap-1 ml-2"
          data-testid="frame-layout-segmented-wrap"
        >
          {/* Layout paradigm — Combobox (icon + label). Compact: shows only
              the current value, scales as more paradigms are added. Empty
              value renders the "여러 레이아웃" placeholder for mixed
              multi-selections. */}
          <Select<LayoutKindChoice>
            value={layoutMixed ? "" : firstLayoutChoice}
            onValueChange={onLayoutChange}
            options={LAYOUT_OPTIONS}
            aria-label="레이아웃 타입"
            placeholder="여러 레이아웃"
            data-testid="frame-layout-select"
            triggerClassName="min-w-[104px]"
          />
        </div>
        {/* WI-074 / DR-029 D7 — frame flip is DISPLAY-ONLY: mirrors content +
            children, which become non-interactive while flipped (unflip to edit). */}
        <div className="ml-2 inline-flex items-center">
          <FlipControls editor={editor} ids={ids} />
        </div>
      </Bar.Quick>
      {homogeneousSpec?.kind === "auto-flex" || homogeneousSpec?.kind === "auto-grid" ? (
        <Bar.More>
          <Accordion>
            {homogeneousSpec?.kind === "auto-flex" ? (
              <>
                <AccordionItem label="레이아웃" defaultOpen data-testid="frame-flex-layout-group">
                  <Bar.Field label="방향">
                    <SegmentedControl<FlexDirection>
                      value={homogeneousSpec.direction}
                      onValueChange={(v) => onFlexFieldChange("direction", v)}
                      options={FLEX_DIRECTION_OPTIONS}
                      aria-label="Flex direction"
                    />
                  </Bar.Field>
                  <Bar.Field label="간격">
                    <NumberSlider
                      value={flexGapPxDisplay}
                      onValueChange={setFlexGapPx}
                      min={0}
                      max={gapMax}
                      step={1}
                      suffix="px"
                      aria-label="간격"
                      className="w-full"
                    />
                  </Bar.Field>
                  <Bar.Field label="정렬">
                    <div className="flex items-start gap-3">
                      <AlignmentPad<FlexJustify, FlexAlign>
                        horizontal={homogeneousSpec.justify}
                        vertical={homogeneousSpec.align}
                        hValues={ALIGN_TRIPLE}
                        vValues={ALIGN_TRIPLE}
                        onChange={onFlexAlignPad}
                        aria-label="Flex 정렬"
                        data-testid="flex-align-pad"
                      />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Select<FlexDistribution>
                          value={
                            (FLEX_DISTRIBUTION_VALUES as ReadonlyArray<string>).includes(
                              homogeneousSpec.justify,
                            )
                              ? (homogeneousSpec.justify as FlexDistribution)
                              : "none"
                          }
                          onValueChange={(v) =>
                            onFlexFieldChange(
                              "justify",
                              v === "none" ? "start" : (v as FlexJustify),
                            )
                          }
                          options={FLEX_DISTRIBUTION_OPTIONS}
                          aria-label="Flex 분포"
                          triggerClassName="w-full"
                        />
                        <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                          <Switch
                            checked={homogeneousSpec.align === "stretch"}
                            onCheckedChange={(on) =>
                              onFlexFieldChange("align", on ? "stretch" : "start")
                            }
                            aria-label="교차축 늘이기"
                          />
                          늘이기
                        </span>
                      </div>
                    </div>
                  </Bar.Field>
                  <Bar.Field label="줄바꿈">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                        <Switch
                          checked={(homogeneousSpec.wrap ?? "nowrap") === "wrap"}
                          onCheckedChange={(on) =>
                            onFlexFieldChange("wrap", on ? "wrap" : "nowrap")
                          }
                          aria-label="줄바꿈"
                          data-testid="flex-wrap-toggle"
                        />
                        줄바꿈
                      </span>
                      {(homogeneousSpec.wrap ?? "nowrap") === "wrap" ? (
                        <Select<AutoFlexSpec["alignContent"] & string>
                          value={homogeneousSpec.alignContent ?? "start"}
                          onValueChange={(v) => onFlexFieldChange("alignContent", v)}
                          options={FLEX_ALIGN_CONTENT_OPTIONS}
                          aria-label="줄 분포 (align-content)"
                          triggerClassName="flex-1"
                        />
                      ) : null}
                    </div>
                  </Bar.Field>
                </AccordionItem>
                <AccordionItem label="여백" data-testid="frame-flex-padding-group">
                  <PaddingFields
                    pxOf={paddingPxOf}
                    max={padMax}
                    onSideChange={setPaddingSidePx}
                    onAllChange={setAllPaddingPx}
                  />
                </AccordionItem>
              </>
            ) : null}
            {homogeneousSpec?.kind === "auto-grid" ? (
              <>
                <AccordionItem label="격자" defaultOpen data-testid="frame-grid-tracks-group">
                  <Bar.Field label="행 × 열">
                    <GridSizePicker
                      columns={homogeneousSpec.columns.length}
                      rows={homogeneousSpec.rows.length}
                      onChange={(cols, rws) => {
                        if (homogeneousSpec.kind !== "auto-grid") return;
                        patchLayoutSpec({
                          ...homogeneousSpec,
                          columns: resizeTracks(homogeneousSpec.columns, cols),
                          rows: resizeTracks(homogeneousSpec.rows, rws),
                        });
                      }}
                      aria-label="그리드 행 열 개수"
                    />
                  </Bar.Field>
                  <Bar.Field label="열 간격">
                    <NumberSlider
                      value={gridColGapPxDisplay}
                      onValueChange={(v) => setGridGapPx("column", v)}
                      min={0}
                      max={colGapMax}
                      step={1}
                      suffix="px"
                      aria-label="열 간격"
                      className="w-full"
                    />
                  </Bar.Field>
                  <Bar.Field label="행 간격">
                    <NumberSlider
                      value={gridRowGapPxDisplay}
                      onValueChange={(v) => setGridGapPx("row", v)}
                      min={0}
                      max={rowGapMax}
                      step={1}
                      suffix="px"
                      aria-label="행 간격"
                      className="w-full"
                    />
                  </Bar.Field>
                </AccordionItem>
                <AccordionItem label="정렬" data-testid="frame-grid-align-group">
                  <Bar.Field label="정렬">
                    <div className="flex items-start gap-3">
                      <AlignmentPad<GridJustify, GridAlign>
                        horizontal={homogeneousSpec.justify}
                        vertical={homogeneousSpec.align}
                        hValues={ALIGN_TRIPLE}
                        vValues={ALIGN_TRIPLE}
                        onChange={onGridAlignPad}
                        aria-label="Grid 정렬"
                        data-testid="grid-align-pad"
                      />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                          <Switch
                            checked={homogeneousSpec.justify === "stretch"}
                            onCheckedChange={(on) =>
                              onGridFieldChange("justify", on ? "stretch" : "start")
                            }
                            aria-label="가로 늘이기"
                          />
                          가로 늘이기
                        </span>
                        <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                          <Switch
                            checked={homogeneousSpec.align === "stretch"}
                            onCheckedChange={(on) =>
                              onGridFieldChange("align", on ? "stretch" : "start")
                            }
                            aria-label="세로 늘이기"
                          />
                          세로 늘이기
                        </span>
                      </div>
                    </div>
                  </Bar.Field>
                  <Bar.Field label="자동 배치">
                    <div className="flex items-center gap-2">
                      <Select<"row" | "column">
                        value={homogeneousSpec.autoFlow ?? "row"}
                        onValueChange={(v) => onGridFieldChange("autoFlow", v)}
                        options={GRID_AUTO_FLOW_OPTIONS}
                        aria-label="자동 배치 방향"
                        data-testid="grid-autoflow-select"
                        triggerClassName="flex-1"
                      />
                      <span className="flex items-center gap-2 text-[11px] text-[color:var(--text-overlay-soft)]">
                        <Switch
                          checked={homogeneousSpec.dense === true}
                          onCheckedChange={(on) => onGridFieldChange("dense", on)}
                          aria-label="빈칸 채우기 (dense)"
                          data-testid="grid-dense-toggle"
                        />
                        빈칸 채우기
                      </span>
                    </div>
                  </Bar.Field>
                </AccordionItem>
                <AccordionItem label="트랙 세부" data-testid="frame-grid-tracksize-group">
                  <Bar.Field label="열">
                    <TrackSizeEditor
                      value={homogeneousSpec.columns as ReadonlyArray<DSTrackSize>}
                      onValueChange={(next) =>
                        onGridFieldChange("columns", next as AutoGridSpec["columns"])
                      }
                      aria-label="Grid columns"
                    />
                  </Bar.Field>
                  <Bar.Field label="행">
                    <TrackSizeEditor
                      value={homogeneousSpec.rows as ReadonlyArray<DSTrackSize>}
                      onValueChange={(next) =>
                        onGridFieldChange("rows", next as AutoGridSpec["rows"])
                      }
                      aria-label="Grid rows"
                    />
                  </Bar.Field>
                </AccordionItem>
                <AccordionItem label="여백" data-testid="frame-grid-padding-group">
                  <PaddingFields
                    pxOf={paddingPxOf}
                    max={padMax}
                    onSideChange={setPaddingSidePx}
                    onAllChange={setAllPaddingPx}
                  />
                </AccordionItem>
              </>
            ) : null}
          </Accordion>
        </Bar.More>
      ) : null}
    </>
  );
};
