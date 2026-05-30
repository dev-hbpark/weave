// Decoration shadow control for the ContextualToolbar (DR-028).
//
// Shadow is a UNIT (decoration.shadow), not an attr — this control edits it via
// `weave.item.setDecoration` (agocraft kit command), reading the current unit
// from the live document (ItemSnapshot carries no units). Shared by every
// kind-section so any item can get a shadow. A toggle adds/clears the unit;
// color + blur + offset sliders shape it. Slider drags use a local draft so the
// thumb tracks live, committing one transaction per drag.

import {
  FILL_UNIT_KIND,
  FILTER_UNIT_KIND,
  type FilterSpec,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  type PaintSpec,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  STROKE_UNIT_KIND,
  type StrokeSpec,
} from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { ColorPicker, NumberSlider, Switch } from "@weave/design-system";
import { type JSX, useEffect, useState } from "react";
import { findItemDeep } from "../../agocraft-mirror.js";
import { parseLinearGradientPaint } from "../../style/fill-paint.js";
import { useDocumentForResolution, useResolveColorById } from "../../style/resolver-context.js";
import { pickerValueToStored } from "../multi-edit.js";

const DEFAULT_SHADOW: ShadowSpec = { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0,0,0,0.25)" };

export function ShadowControls({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();

  // Representative current shadow (first item that has the unit) + whether any does.
  let current: ShadowSpec | undefined;
  if (doc !== null) {
    for (const id of ids) {
      const item = findItemDeep(doc, id);
      const s = item
        ? (findUnitInItem(item, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined)
        : undefined;
      if (s !== undefined) {
        current = s;
        break;
      }
    }
  }
  const on = current !== undefined;
  const spec = current ?? DEFAULT_SHADOW;

  // Live draft so slider thumbs track during a drag; re-synced when the committed
  // value (or selection) changes.
  const [draft, setDraft] = useState<ShadowSpec>(spec);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on committed spec field values; `spec` is a fresh object each render (depending on it would loop)
  useEffect(() => {
    setDraft(spec);
  }, [spec.x, spec.y, spec.blur, spec.spread, spec.color]);

  const writeAll = (next: ShadowSpec | null): void => {
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", {
        itemId: id,
        kind: SHADOW_UNIT_KIND,
        attrs: next,
      });
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-default)]">
        <span>그림자</span>
        <Switch
          checked={on}
          onCheckedChange={(v) => writeAll(v ? DEFAULT_SHADOW : null)}
          aria-label="그림자"
          data-testid="shadow-toggle"
        />
      </div>
      {on ? (
        <div className="grid gap-1.5 pl-1">
          <ColorPicker
            aria-label="그림자 색"
            value={draft.color}
            onValueChange={(v) => setDraft((d) => ({ ...d, color: v }))}
            onValueCommit={(v) => writeAll({ ...draft, color: v })}
          />
          <NumberSlider
            aria-label="흐림"
            value={draft.blur}
            min={0}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, blur: v }))}
            onValueCommit={(v) => writeAll({ ...draft, blur: v })}
          />
          <NumberSlider
            aria-label="가로 오프셋"
            value={draft.x}
            min={-100}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, x: v }))}
            onValueCommit={(v) => writeAll({ ...draft, x: v })}
          />
          <NumberSlider
            aria-label="세로 오프셋"
            value={draft.y}
            min={-100}
            max={100}
            step={1}
            suffix="px"
            onValueChange={(v) => setDraft((d) => ({ ...d, y: v }))}
            onValueCommit={(v) => writeAll({ ...draft, y: v })}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Read the first selected item's effective value of `read` from the live doc
 *  (unit-or-attr resolved by the caller). Returns `fallback` when unavailable. */
function firstItemValue<T>(
  doc: ReturnType<typeof useDocumentForResolution>,
  ids: ReadonlyArray<string>,
  read: (item: ReturnType<typeof findItemDeep>) => T | undefined,
  fallback: T,
): T {
  if (doc === null) return fallback;
  for (const id of ids) {
    const item = findItemDeep(doc, id);
    if (item === undefined) continue;
    const v = read(item);
    if (v !== undefined) return v;
  }
  return fallback;
}

/** Layer opacity as a decoration.opacity UNIT (DR-028). Reads the effective value
 *  (unit ?? legacy attrs.opacity ?? 1); writes the unit on commit, clearing it at
 *  100% (1 = identity, no unit). */
export function OpacityControl({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();
  const value = firstItemValue(
    doc,
    ids,
    (item) =>
      item === undefined
        ? undefined
        : (findUnitInItem(item, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value,
    1,
  );
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const write = (v: number): void => {
    const attrs = v >= 1 ? null : { value: v };
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", { itemId: id, kind: OPACITY_UNIT_KIND, attrs });
    }
  };
  return (
    <NumberSlider
      aria-label="투명도"
      value={Math.round(draft * 100)}
      min={0}
      max={100}
      step={1}
      suffix="%"
      onValueChange={(v) => setDraft(v / 100)}
      onValueCommit={(v) => write(v / 100)}
    />
  );
}

/** Layer blur as a decoration.filter UNIT (DR-028). v1 exposes blur (px); other
 *  FilterSpec fields (brightness/contrast/…) are preserved from the effective
 *  spec. Clears the unit when the whole filter is identity. */
export function FilterControl({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();
  const spec = firstItemValue<FilterSpec>(
    doc,
    ids,
    (item) =>
      item === undefined
        ? undefined
        : (findUnitInItem(item, FILTER_UNIT_KIND)?.attrs as FilterSpec | undefined),
    {},
  );
  const [draft, setDraft] = useState(spec.blur ?? 0);
  useEffect(() => setDraft(spec.blur ?? 0), [spec.blur]);

  const write = (blur: number): void => {
    const next: FilterSpec = { ...spec, blur };
    const identity =
      blur === 0 &&
      spec.brightness === undefined &&
      spec.contrast === undefined &&
      spec.saturate === undefined &&
      spec.hueRotate === undefined;
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", {
        itemId: id,
        kind: FILTER_UNIT_KIND,
        attrs: identity ? null : next,
      });
    }
  };
  return (
    <NumberSlider
      aria-label="흐림(필터)"
      value={draft}
      min={0}
      max={20}
      step={0.5}
      suffix="px"
      onValueChange={setDraft}
      onValueCommit={write}
    />
  );
}

/** Paint from a ColorPicker emit: a linear-gradient string → gradient spec, else
 *  a solid paint (StyleRef-normalized so `var(--token)` keeps its identity). */
function paintFromEmit(v: string): PaintSpec {
  return (
    parseLinearGradientPaint(v) ??
    ({ type: "solid", color: pickerValueToStored(v) } as unknown as PaintSpec)
  );
}

/** Fill as a decoration.fill UNIT (DR-028). Reads the effective paint (unit ??
 *  legacy attrs.fill); writes the unit on commit. Solid + linear-gradient via the
 *  ColorPicker; image/video fill stays on the section's detailed field for now. */
export function FillControl({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();
  const fill = firstItemValue<PaintSpec>(
    doc,
    ids,
    (item) =>
      item === undefined
        ? undefined
        : (findUnitInItem(item, FILL_UNIT_KIND)?.attrs as PaintSpec | undefined),
    { type: "solid", color: "#cccccc" },
  );
  const raw = fill.type === "solid" ? (fill as { color?: string }).color : undefined;
  const resolved = useResolveColorById(raw, ids[0] ?? "", "#cccccc");
  const write = (v: string): void => {
    const next = paintFromEmit(v);
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", { itemId: id, kind: FILL_UNIT_KIND, attrs: next });
    }
  };
  return (
    <ColorPicker
      aria-label="채우기"
      value={fill.type === "solid" ? (resolved ?? "#cccccc") : "#cccccc"}
      onValueChange={() => {}}
      onValueCommit={write}
    />
  );
}

/** Stroke as a decoration.stroke UNIT (DR-028). Color + width; width 0 clears the
 *  unit (no stroke). Picking a color when there's no stroke creates a 1px one. */
export function StrokeControl({
  editor,
  ids,
}: {
  readonly editor: Editor;
  readonly ids: ReadonlyArray<string>;
}): JSX.Element {
  const doc = useDocumentForResolution();
  const stroke = firstItemValue<StrokeSpec>(
    doc,
    ids,
    (item) =>
      item === undefined
        ? undefined
        : (findUnitInItem(item, STROKE_UNIT_KIND)?.attrs as StrokeSpec | undefined),
    { paint: { type: "solid", color: "#000000" }, width: 0 },
  );
  const raw =
    stroke.paint.type === "solid" ? (stroke.paint as { color?: string }).color : undefined;
  const resolved = useResolveColorById(raw, ids[0] ?? "", "#000000");
  const [draftW, setDraftW] = useState(stroke.width);
  useEffect(() => setDraftW(stroke.width), [stroke.width]);

  const setStroke = (next: StrokeSpec): void => {
    for (const id of ids) {
      editor.exec("weave.item.setDecoration", {
        itemId: id,
        kind: STROKE_UNIT_KIND,
        attrs: next.width <= 0 ? null : next,
      });
    }
  };
  return (
    <div className="grid gap-1.5">
      <ColorPicker
        aria-label="외곽선 색"
        value={stroke.paint.type === "solid" ? (resolved ?? "#000000") : "#000000"}
        onValueChange={() => {}}
        onValueCommit={(v) =>
          setStroke({
            ...stroke,
            paint: paintFromEmit(v),
            width: stroke.width > 0 ? stroke.width : 1,
          })
        }
      />
      <NumberSlider
        aria-label="외곽선 두께"
        value={draftW}
        min={0}
        max={40}
        step={1}
        suffix="px"
        onValueChange={setDraftW}
        onValueCommit={(w) => setStroke({ ...stroke, width: w })}
      />
    </div>
  );
}
