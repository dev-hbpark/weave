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
  ColorPicker,
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
import type { ReactElement } from "react";
import {
  batchPerItem,
  isMixed,
  MixedBadge,
  pickerValueToStored,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
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
] as const;
type FlexDistribution = (typeof FLEX_DISTRIBUTION_OPTIONS)[number]["value"];

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

/** Padding 4-side sub-form. Shared by Flex + Grid Bar.More — both specs
 *  carry a `{ top, right, bottom, left }` ratio object. */
function PaddingFields({
  padding,
  onSideChange,
}: {
  readonly padding: { top: number; right: number; bottom: number; left: number };
  readonly onSideChange: (side: (typeof PADDING_SIDES)[number], value: number) => void;
}): ReactElement {
  return (
    <Bar.Field label="Padding">
      <div className="flex flex-col gap-1 w-full" data-testid="frame-layout-padding">
        {PADDING_SIDES.map((side) => (
          <div key={side} className="flex items-center gap-2">
            <span className="text-[11px] text-[color:var(--text-overlay-soft)] w-12 shrink-0">
              {PADDING_LABEL[side]}
            </span>
            <NumberSlider
              value={padding[side]}
              onValueChange={(v) => onSideChange(side, v)}
              min={0}
              max={0.25}
              step={0.005}
              format={(v) => `${Math.round(v * 1000) / 10}%`}
              aria-label={`Padding ${side}`}
              className="flex-1"
            />
          </div>
        ))}
      </div>
    </Bar.Field>
  );
}

export const FrameBackgroundSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  // WI-040 — `attrs.background` may be a `StyleRef` (theme token) after
  // the user picked a theme swatch. `useResolveSharedColor` runs the
  // cascade walker per item before comparing values, so the picker sees
  // a CSS string and "Mixed" detection works on semantic equality.
  const background = useResolveSharedColor(
    items,
    (it) => (it.attrs as unknown as { background?: unknown }).background,
  );
  const bgHasValue = !isMixed(background) && background !== undefined;

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

  /** Padding 4-side override helper — preserves the other 3 sides. Used by
   *  both Flex and Grid Bar.More (same 4-side shape, RISK-002 C2.4). */
  const onPaddingSideChange = (side: "top" | "right" | "bottom" | "left", value: number) => {
    if (homogeneousSpec === undefined) return;
    if (homogeneousSpec.kind === "auto-flex") {
      patchLayoutSpec({
        ...homogeneousSpec,
        padding: { ...homogeneousSpec.padding, [side]: value },
      });
    } else if (homogeneousSpec.kind === "auto-grid") {
      patchLayoutSpec({
        ...homogeneousSpec,
        padding: { ...homogeneousSpec.padding, [side]: value },
      });
    }
  };

  return (
    <>
      <Bar.Kind icon={<IconFrame size={18} />} label="Frame" />
      <Bar.Quick>
        <div className="inline-flex items-center gap-1">
          <ColorPicker
            aria-label="Frame background"
            value={isMixed(background) ? "#cccccc" : (background ?? "#ffffff")}
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => ({
                attrs: {
                  ...prev.attrs,
                  background: pickerValueToStored(v),
                } as unknown as Readonly<Record<string, unknown>>,
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
              data-testid="frame-bg-clear"
              aria-label="배경 비우기"
              data-tip="배경 비우기 (투명)"
            >
              <IconClose size={14} />
            </Button>
          ) : null}
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
      </Bar.Quick>
      {homogeneousSpec?.kind === "auto-flex" ? (
        <Bar.More>
          <Accordion>
            <AccordionItem label="레이아웃" defaultOpen data-testid="frame-flex-layout-group">
              <Bar.Field label="Direction">
                <SegmentedControl<FlexDirection>
                  value={homogeneousSpec.direction}
                  onValueChange={(v) => onFlexFieldChange("direction", v)}
                  options={FLEX_DIRECTION_OPTIONS}
                  aria-label="Flex direction"
                />
              </Bar.Field>
              <Bar.Field label="Gap">
                <NumberSlider
                  value={homogeneousSpec.gap}
                  onValueChange={(v) => onFlexFieldChange("gap", v)}
                  min={0}
                  max={0.2}
                  step={0.005}
                  format={(v) => `${Math.round(v * 1000) / 10}%`}
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
                        homogeneousSpec.justify === "space-between" ||
                        homogeneousSpec.justify === "space-around"
                          ? homogeneousSpec.justify
                          : "none"
                      }
                      onValueChange={(v) =>
                        onFlexFieldChange("justify", v === "none" ? "start" : (v as FlexJustify))
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
            </AccordionItem>
            <AccordionItem label="여백" data-testid="frame-flex-padding-group">
              <PaddingFields padding={homogeneousSpec.padding} onSideChange={onPaddingSideChange} />
            </AccordionItem>
          </Accordion>
        </Bar.More>
      ) : null}
      {homogeneousSpec?.kind === "auto-grid" ? (
        <Bar.More>
          <Accordion>
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
              <Bar.Field label="Column gap">
                <NumberSlider
                  value={homogeneousSpec.columnGap}
                  onValueChange={(v) => onGridFieldChange("columnGap", v)}
                  min={0}
                  max={0.2}
                  step={0.005}
                  format={(v) => `${Math.round(v * 1000) / 10}%`}
                  className="w-full"
                />
              </Bar.Field>
              <Bar.Field label="Row gap">
                <NumberSlider
                  value={homogeneousSpec.rowGap}
                  onValueChange={(v) => onGridFieldChange("rowGap", v)}
                  min={0}
                  max={0.2}
                  step={0.005}
                  format={(v) => `${Math.round(v * 1000) / 10}%`}
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
            </AccordionItem>
            <AccordionItem label="트랙 세부" data-testid="frame-grid-tracksize-group">
              <Bar.Field label="Columns">
                <TrackSizeEditor
                  value={homogeneousSpec.columns as ReadonlyArray<DSTrackSize>}
                  onValueChange={(next) =>
                    onGridFieldChange("columns", next as AutoGridSpec["columns"])
                  }
                  aria-label="Grid columns"
                />
              </Bar.Field>
              <Bar.Field label="Rows">
                <TrackSizeEditor
                  value={homogeneousSpec.rows as ReadonlyArray<DSTrackSize>}
                  onValueChange={(next) => onGridFieldChange("rows", next as AutoGridSpec["rows"])}
                  aria-label="Grid rows"
                />
              </Bar.Field>
            </AccordionItem>
            <AccordionItem label="여백" data-testid="frame-grid-padding-group">
              <PaddingFields padding={homogeneousSpec.padding} onSideChange={onPaddingSideChange} />
            </AccordionItem>
          </Accordion>
        </Bar.More>
      ) : null}
    </>
  );
};
