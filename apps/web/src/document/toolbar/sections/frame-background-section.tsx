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
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  IconClose,
  IconFrame,
  IconLayoutAbsolute,
  IconLayoutFlex,
  IconLayoutGrid,
  NumberSlider,
  SegmentedControl,
} from "@weave/design-system";
import {
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
  if (choice === "auto-grid") return createAutoGridSpec({ columns: [trackFr(1)], rows: [trackFr(1)] });
  return undefined; // "absolute"
}

const FLEX_DIRECTION_OPTIONS: ReadonlyArray<{ value: FlexDirection; label: string }> = [
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
];

const FLEX_JUSTIFY_OPTIONS: ReadonlyArray<{ value: FlexJustify; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Between" },
  { value: "space-around", label: "Around" },
];

const FLEX_ALIGN_OPTIONS: ReadonlyArray<{ value: FlexAlign; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

const GRID_JUSTIFY_OPTIONS: ReadonlyArray<{ value: GridJustify; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

const GRID_ALIGN_OPTIONS: ReadonlyArray<{ value: GridAlign; label: string }> = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
];

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
    // Apply to every selected item via dedicated layout command so
    // (a) the agocraft `item.layout` Patch fires (mergeKey folds rapid
    // flips into one undo entry), (b) the reducer mirrors into doc state.
    for (const id of ids) {
      editor.exec("weave.frame.setLayout", { itemId: id, layout: nextSpec });
    }
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
    for (const id of ids) {
      editor.exec("weave.frame.setLayout", { itemId: id, layout: next });
    }
  };

  const onFlexFieldChange = <K extends keyof AutoFlexSpec>(key: K, value: AutoFlexSpec[K]) => {
    if (homogeneousSpec?.kind !== "auto-flex") return;
    patchLayoutSpec({ ...homogeneousSpec, [key]: value } as AutoFlexSpec);
  };

  const onGridFieldChange = <K extends keyof AutoGridSpec>(key: K, value: AutoGridSpec[K]) => {
    if (homogeneousSpec?.kind !== "auto-grid") return;
    patchLayoutSpec({ ...homogeneousSpec, [key]: value } as AutoGridSpec);
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
          {/* When mixed, the active value is intentionally `""` so no chip
              highlights — Radix ToggleGroup treats an out-of-options value
              as deselected. Picking any option then writes uniformly. */}
          <SegmentedControl<LayoutKindChoice>
            value={layoutMixed ? ("" as LayoutKindChoice) : firstLayoutChoice}
            onValueChange={onLayoutChange}
            options={LAYOUT_OPTIONS}
            aria-label="레이아웃 타입"
            className="data-testid-frame-layout"
          />
          <MixedBadge visible={layoutMixed} />
        </div>
      </Bar.Quick>
      {homogeneousSpec?.kind === "auto-flex" ? (
        <Bar.More>
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
          <Bar.Field label="Justify">
            <SegmentedControl<FlexJustify>
              value={homogeneousSpec.justify}
              onValueChange={(v) => onFlexFieldChange("justify", v)}
              options={FLEX_JUSTIFY_OPTIONS}
              aria-label="Flex justify"
            />
          </Bar.Field>
          <Bar.Field label="Align">
            <SegmentedControl<FlexAlign>
              value={homogeneousSpec.align}
              onValueChange={(v) => onFlexFieldChange("align", v)}
              options={FLEX_ALIGN_OPTIONS}
              aria-label="Flex align"
            />
          </Bar.Field>
        </Bar.More>
      ) : null}
      {homogeneousSpec?.kind === "auto-grid" ? (
        <Bar.More>
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
          <Bar.Field label="Justify">
            <SegmentedControl<GridJustify>
              value={homogeneousSpec.justify}
              onValueChange={(v) => onGridFieldChange("justify", v)}
              options={GRID_JUSTIFY_OPTIONS}
              aria-label="Grid justify"
            />
          </Bar.Field>
          <Bar.Field label="Align">
            <SegmentedControl<GridAlign>
              value={homogeneousSpec.align}
              onValueChange={(v) => onGridFieldChange("align", v)}
              options={GRID_ALIGN_OPTIONS}
              aria-label="Grid align"
            />
          </Bar.Field>
        </Bar.More>
      ) : null}
    </>
  );
};
