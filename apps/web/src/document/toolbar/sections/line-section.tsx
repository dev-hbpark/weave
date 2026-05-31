// DR-025 / WI-062 — LineSection: the properties panel for the `line` KIND.
//
// A line is STROKE-ONLY. Unlike ShapeSection there is NO fill / corner-radius /
// sub-kind picker — only the stroke (color + width), the two endpoint markers
// (none / triangle / open / diamond / circle), and opacity. Registered for the
// "line" kind, so selecting a line shows this instead of the shape panel
// (도형과 선은 완전 다른 타입).

import {
  ContextualToolbar as Bar,
  IconShapeLine,
  Select,
} from "@weave/design-system";
import type { LineAttrs } from "../../types.js";
import { isMixed, MixedBadge, sharedValue, updateAll } from "../multi-edit.js";
import { OpacityControl, StrokeControl } from "./shadow-controls.js";
import type { ToolbarSectionComponent } from "./types.js";

type HeadStyle = "none" | "triangle" | "open" | "diamond" | "circle";
type Heads = { readonly start: HeadStyle; readonly end: HeadStyle };
const NO_HEADS: Heads = { start: "none", end: "none" };

const HEAD_OPTIONS: ReadonlyArray<{ value: HeadStyle; label: string }> = [
  { value: "none", label: "없음" },
  { value: "triangle", label: "삼각형" },
  { value: "open", label: "열린 화살표" },
  { value: "diamond", label: "다이아몬드" },
  { value: "circle", label: "원" },
];

export const LineSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  const heads = sharedValue<Heads>(
    items,
    (it) => (it.attrs as unknown as LineAttrs).heads ?? NO_HEADS,
    (a, b) => a.start === b.start && a.end === b.end,
  );
  const startHead: HeadStyle = isMixed(heads) ? "none" : heads.start;
  const endHead: HeadStyle = isMixed(heads) ? "none" : heads.end;

  const setHead = (which: "start" | "end", v: HeadStyle): void =>
    updateAll(editor, ids, (prev) => {
      const cur = (prev.attrs as unknown as LineAttrs).heads ?? NO_HEADS;
      return { attrs: { ...prev.attrs, heads: { ...cur, [which]: v } } };
    });

  return (
    <>
      <Bar.Kind icon={<IconShapeLine size={18} />} label="Line" />
      <Bar.Quick>
        {/* Stroke is the line's primary (and only) paint. */}
        <StrokeControl editor={editor} ids={ids} />
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="Stroke">
          <StrokeControl editor={editor} ids={ids} />
        </Bar.Field>
        <Bar.Field label="시작 마커">
          <Select<HeadStyle>
            value={startHead}
            onValueChange={(v) => setHead("start", v)}
            options={HEAD_OPTIONS}
            aria-label="Start endpoint marker"
            triggerClassName="w-full"
          />
          <MixedBadge visible={isMixed(heads)} />
        </Bar.Field>
        <Bar.Field label="끝 마커">
          <Select<HeadStyle>
            value={endHead}
            onValueChange={(v) => setHead("end", v)}
            options={HEAD_OPTIONS}
            aria-label="End endpoint marker"
            triggerClassName="w-full"
          />
        </Bar.Field>
        <Bar.Field label="Opacity">
          <OpacityControl editor={editor} ids={ids} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
