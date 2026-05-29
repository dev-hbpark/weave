// WI-058 — QR contextual-toolbar section. Edits the data-driven QR: the `data`
// string (primary), error-correction level, module style, and foreground /
// background paint (solid OR gradient, reusing the shape-fill round-trip).

import { type PaintSpec, paintToCss } from "@agocraft/core";
import { ContextualToolbar as Bar, ColorPicker, IconQr, Select } from "@weave/design-system";
import { parseLinearGradientPaint } from "../../style/fill-paint.js";
import type { QrAttrs } from "../../types.js";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  sharedValue,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

const EC_OPTIONS = [
  { value: "L", label: "L · 7%" },
  { value: "M", label: "M · 15%" },
  { value: "Q", label: "Q · 25%" },
  { value: "H", label: "H · 30%" },
] as const;

const STYLE_OPTIONS = [
  { value: "square", label: "사각형" },
  { value: "dot", label: "원형" },
  { value: "rounded", label: "둥근" },
] as const;

const paintToPicker = (p: PaintSpec | null | undefined, fallback: string): string => {
  if (p == null) return fallback;
  if (p.type === "solid") return typeof p.color === "string" ? p.color : fallback;
  if (p.type === "linear-gradient" || p.type === "radial-gradient") return paintToCss(p);
  return fallback;
};

const fillFromEmit = (v: string): PaintSpec =>
  parseLinearGradientPaint(v) ??
  ({ type: "solid", color: pickerValueToStored(v) } as unknown as PaintSpec);

export const QrSection: ToolbarSectionComponent = ({ editor, items, ids }) => {
  const data = sharedValue<string>(items, (it) => (it.attrs as unknown as QrAttrs).data ?? "");
  const ecLevel = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as QrAttrs).ecLevel ?? "M",
  );
  const moduleStyle = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as QrAttrs).moduleStyle ?? "square",
  );
  const fgColor = useResolveSharedColor(items, (it) =>
    paintToPicker((it.attrs as unknown as QrAttrs).foreground, "#111827"),
  );
  const bgColor = useResolveSharedColor(items, (it) =>
    paintToPicker((it.attrs as unknown as QrAttrs).background, "#ffffff"),
  );

  const setAttr = (patch: Partial<QrAttrs>) =>
    updateAll(editor, ids, (prev) => ({
      attrs: { ...prev.attrs, ...patch } as unknown as Readonly<Record<string, unknown>>,
    }));

  return (
    <>
      <Bar.Kind icon={<IconQr size={18} />} label="QR" />
      <Bar.Quick>
        <input
          type="text"
          inputMode="url"
          aria-label="QR 데이터"
          placeholder="https://… 또는 텍스트"
          value={isMixed(data) ? "" : data}
          onChange={(e) => setAttr({ data: e.currentTarget.value })}
          className="w-[220px] px-2 py-1.5 rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] text-[12px] text-[color:var(--text-strong)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        />
        <MixedBadge visible={isMixed(data)} />
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="Color">
          <ColorPicker
            aria-label="QR 전경색"
            value={isMixed(fgColor) ? "#cccccc" : (fgColor ?? "#111827")}
            onValueCommit={(v) => setAttr({ foreground: fillFromEmit(v) })}
            onValueChange={() => {
              /* commit-only */
            }}
          />
          <ColorPicker
            aria-label="QR 배경색"
            value={isMixed(bgColor) ? "#cccccc" : (bgColor ?? "#ffffff")}
            onValueCommit={(v) => setAttr({ background: fillFromEmit(v) })}
            onValueChange={() => {
              /* commit-only */
            }}
          />
          <MixedBadge visible={isMixed(fgColor) || isMixed(bgColor)} />
        </Bar.Field>
        <Bar.Field label="Error level">
          <Select<string>
            value={isMixed(ecLevel) ? "" : ecLevel}
            onValueChange={(v) => setAttr({ ecLevel: v as "L" | "M" | "Q" | "H" })}
            options={EC_OPTIONS as unknown as ReadonlyArray<{ value: string; label: string }>}
            aria-label="오류 정정 레벨"
            placeholder="여러 값"
            triggerClassName="w-full"
          />
          <MixedBadge visible={isMixed(ecLevel)} />
        </Bar.Field>
        <Bar.Field label="Module">
          <Select<string>
            value={isMixed(moduleStyle) ? "" : moduleStyle}
            onValueChange={(v) => setAttr({ moduleStyle: v as "square" | "dot" | "rounded" })}
            options={STYLE_OPTIONS as unknown as ReadonlyArray<{ value: string; label: string }>}
            aria-label="모듈 모양"
            placeholder="여러 값"
            triggerClassName="w-full"
          />
          <MixedBadge visible={isMixed(moduleStyle)} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
