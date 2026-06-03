// WI-077/079/080 — ChartSection: the properties panel for the `chart` KIND.
//
// A chart references a typed dataset (root-unit store) by id; this panel edits
// the VISUAL mapping — chartType + the column→channel encoding. Both are
// REGISTRY-DRIVEN (DR-036): the chart-type picker lists `availableChartTypes()`,
// and the encoding editor iterates the selected type's `spec.channels`, rendering
// one field picker per slot (columns filtered by the slot's `accepts` types).
// A `multiple` slot (e.g. cartesian / radar `value`) renders toggle chips so the
// user can pick several columns → several series. Adding a chart type needs NO
// edit here.

import { ContextualToolbar as Bar, Button, IconChart, Select } from "@weave/design-system";
import { type JSX, useState } from "react";
import { DatasetEditorDialog } from "../../dataset/DatasetEditorDialog.js";
import { useResolveDataset } from "../../dataset/dataset-context.js";
import type { DatasetColumn } from "../../dataset/dataset-store.js";
import { useChartElementSelection } from "../../domains/chart/chart-element-context.js";
import {
  type Aggregate,
  channelFields,
  migrateEncoding,
  seriesField,
  setChannel,
  setValueAggregate,
  valueAggregate,
  valueFields,
} from "../../domains/chart/chart-model.js";
import { chartSample } from "../../domains/chart/chart-samples.js";
import {
  autoEncode,
  availableChartTypes,
  type ChannelSlot,
  chartTypeSpec,
  requiredChannelsSatisfied,
} from "../../domains/chart/chart-types.js";
import type { ChartAttrs } from "../../types.js";
import { isMixed, MixedBadge, sharedValue, updateAll } from "../multi-edit.js";
import { ChartElementEditor } from "./chart-element-editor.js";
import { OpacityControl } from "./shadow-controls.js";
import type { ToolbarSectionComponent } from "./types.js";

type ChartType = ChartAttrs["chartType"];

// DR-036 — the chart-type picker is driven by the registry, so a newly-registered
// type appears here automatically (no edit to this file).
const CHART_TYPE_OPTIONS: ReadonlyArray<{ value: ChartType; label: string }> =
  availableChartTypes().map((s) => ({ value: s.type, label: s.label }));

/** DR-036 — value-channel aggregate options ("" = raw, no aggregation). */
const AGG_OPTIONS: ReadonlyArray<{ value: Aggregate | ""; label: string }> = [
  { value: "", label: "없음(원본)" },
  { value: "sum", label: "합계" },
  { value: "mean", label: "평균" },
  { value: "count", label: "개수" },
  { value: "min", label: "최소" },
  { value: "max", label: "최대" },
  { value: "median", label: "중앙값" },
];

/** One encoding slot's field picker. `multiple` slots render toggle chips
 *  (pick several columns → several series); single slots render a Select.
 *  Columns are filtered to the slot's accepted FieldTypes. */
function ChannelSlotField({
  slot,
  columns,
  selected,
  onChange,
}: {
  readonly slot: ChannelSlot;
  readonly columns: ReadonlyArray<DatasetColumn>;
  readonly selected: ReadonlyArray<string>;
  readonly onChange: (fields: ReadonlyArray<string>) => void;
}): JSX.Element {
  const opts = columns.filter((c) => slot.accepts.includes(c.type));
  if (slot.multiple === true) {
    return (
      <Bar.Field label={slot.label}>
        <div className="flex flex-wrap gap-1" data-testid={`chart-channel-${slot.channel}`}>
          {opts.length === 0 ? (
            <span className="text-[11px] text-[color:var(--text-soft)]">사용할 열 없음</span>
          ) : (
            opts.map((c) => {
              const on = selected.includes(c.name);
              return (
                <Button
                  key={c.name}
                  size="md"
                  variant={on ? "primary" : "subtle"}
                  aria-pressed={on}
                  data-testid={`chart-channel-chip-${c.name}`}
                  onClick={() =>
                    onChange(on ? selected.filter((s) => s !== c.name) : [...selected, c.name])
                  }
                >
                  {c.name}
                </Button>
              );
            })
          )}
        </div>
      </Bar.Field>
    );
  }
  const options = [
    ...(slot.required ? [] : [{ value: "", label: "(없음)" }]),
    ...opts.map((c) => ({ value: c.name, label: c.name })),
  ];
  return (
    <Bar.Field label={slot.label}>
      <Select<string>
        value={selected[0] ?? ""}
        onValueChange={(v) => onChange(v === "" ? [] : [v])}
        options={options}
        aria-label={slot.label}
        triggerClassName="w-full"
        data-testid={`chart-channel-${slot.channel}`}
      />
    </Bar.Field>
  );
}

export const ChartSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  const resolveDataset = useResolveDataset();
  const { selected, select } = useChartElementSelection();
  const [editorOpen, setEditorOpen] = useState(false);

  const chartType = sharedValue<ChartType>(
    items,
    (it) => (it.attrs as unknown as ChartAttrs).chartType ?? "bar",
  );
  const datasetId = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as ChartAttrs).datasetId ?? "",
  );
  const curType: ChartType = isMixed(chartType) ? "bar" : chartType;
  const spec = chartTypeSpec(curType);

  // Column options come from the (first) referenced dataset. Mixed dataset ids
  // across a multi-selection → no shared column set, so the pickers go empty.
  const resolvedId = isMixed(datasetId) ? "" : datasetId;
  const dataset = resolvedId === "" ? undefined : resolveDataset(resolvedId);
  const columns = dataset?.columns ?? [];

  // The encoding shown reflects the FIRST selected chart; edits apply to all.
  const enc0 = migrateEncoding((items[0]?.attrs as unknown as ChartAttrs | undefined)?.encoding);
  const valueCol0 = channelFields(enc0, "value")[0] ?? "";
  // WI-088 — >1 series (multi value columns OR a series-split) → datum overrides
  // key by (series, category).
  const isMultiSeries = valueFields(enc0).length > 1 || seriesField(enc0) !== undefined;

  // Switching type auto-maps the new type's required channels from the dataset's
  // typed columns (keeping compatible bindings), so the chart renders instead of
  // falling to the placeholder (DR-036).
  const setChartType = (v: ChartType): void => {
    const encoding = autoEncode(v, columns, enc0);
    updateAll(editor, ids, (prev) => ({ attrs: { ...prev.attrs, chartType: v, encoding } }));
  };

  // When the chart can't render with the current dataset (a placeholder), offer
  // to load a fitting sample for the type → repoints the chart's own dataset +
  // sets the encoding in one undoable step. Single-select only.
  const placeholder = !requiredChannelsSatisfied(curType, enc0);
  const sampleType = ids.length === 1 && placeholder && chartSample(curType) !== undefined;
  const loadSample = (): void => {
    const sample = chartSample(curType);
    const chartId = ids[0];
    if (sample === undefined || resolvedId === "" || chartId === undefined) return;
    editor.runBatch(() => {
      editor.exec("weave.dataset.update", { id: resolvedId, dataset: sample.dataset });
      editor.exec("weave.item.update", { itemId: chartId, attrs: { encoding: sample.encoding } });
    });
  };

  const setAgg = (agg: Aggregate | undefined): void =>
    updateAll(editor, ids, (prev) => ({
      attrs: {
        ...prev.attrs,
        encoding: setValueAggregate(
          migrateEncoding((prev.attrs as unknown as ChartAttrs).encoding),
          agg,
        ),
      },
    }));

  const setChannelFields = (slot: ChannelSlot, fields: ReadonlyArray<string>): void =>
    updateAll(editor, ids, (prev) => {
      const enc = migrateEncoding((prev.attrs as unknown as ChartAttrs).encoding);
      return {
        attrs: {
          ...prev.attrs,
          encoding: setChannel(enc, slot.channel, fields, slot.multiple === true),
        },
      };
    });

  return (
    <>
      <Bar.Kind icon={<IconChart size={18} />} label="Chart" />
      <Bar.Quick>
        <Select<ChartType>
          value={curType}
          onValueChange={setChartType}
          options={CHART_TYPE_OPTIONS}
          aria-label="Chart type"
          triggerClassName="w-[88px]"
        />
        <MixedBadge visible={isMixed(chartType)} />
        <Button
          variant="ghost"
          size="md"
          disabled={resolvedId === ""}
          onClick={() => setEditorOpen(true)}
          data-testid="chart-edit-data"
        >
          데이터 편집
        </Button>
        {sampleType ? (
          <Button variant="ghost" size="md" onClick={loadSample} data-testid="chart-load-sample">
            샘플 데이터
          </Button>
        ) : null}
        {ids.length === 1 && selected !== null && selected.chartItemId === ids[0] ? (
          <ChartElementEditor
            editor={editor}
            chartId={ids[0]}
            overrides={(items[0]?.attrs as unknown as ChartAttrs).overrides}
            isPie={curType === "pie"}
            selected={selected}
            datasetId={resolvedId}
            valueColumn={selected.seriesName ?? valueCol0}
            isMultiSeries={isMultiSeries}
            onDeselect={() => select(null)}
          />
        ) : null}
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="종류">
          <Select<ChartType>
            value={curType}
            onValueChange={setChartType}
            options={CHART_TYPE_OPTIONS}
            aria-label="Chart type"
            triggerClassName="w-full"
          />
        </Bar.Field>
        {/* DR-036 — spec-driven encoding editor: one picker per channel slot. */}
        {spec?.channels.map((slot) => (
          <ChannelSlotField
            key={slot.channel}
            slot={slot}
            columns={columns}
            selected={channelFields(enc0, slot.channel)}
            onChange={(fields) => setChannelFields(slot, fields)}
          />
        ))}
        {/* DR-036 — value aggregate (collapses repeated categories). */}
        {spec?.aggregatable === true ? (
          <Bar.Field label="집계">
            <Select<Aggregate | "">
              value={valueAggregate(enc0) ?? ""}
              onValueChange={(v) => setAgg(v === "" ? undefined : v)}
              options={AGG_OPTIONS}
              aria-label="값 집계"
              triggerClassName="w-full"
              data-testid="chart-aggregate"
            />
          </Bar.Field>
        ) : null}
        <Bar.Field label="Opacity">
          <OpacityControl editor={editor} ids={ids} />
        </Bar.Field>
      </Bar.More>
      {resolvedId !== "" ? (
        <DatasetEditorDialog
          editor={editor}
          datasetId={resolvedId}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      ) : null}
    </>
  );
};
