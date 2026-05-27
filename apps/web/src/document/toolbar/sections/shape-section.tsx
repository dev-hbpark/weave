import type { ShapeAttrs, ShapeSubKind } from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  NumberSlider,
  SegmentedControl,
} from "@weave/design-system";
import {
  isMixed,
  MixedBadge,
  pickerValueToStored,
  sharedValue,
  truncateUrl,
  updateAll,
  useResolveSharedColor,
} from "../multi-edit.js";
import type { ToolbarSectionComponent } from "./types.js";

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

export const ShapeSection: ToolbarSectionComponent = ({ editor, items, ids, onEditShapeFill }) => {
  const shape = sharedValue<ShapeSubKind>(items, (it) => (it.attrs as unknown as ShapeAttrs).shape);
  const fillType = sharedValue<string>(
    items,
    (it) => (it.attrs as unknown as ShapeAttrs).fill.type,
  );
  // WI-040 — fill.color / stroke.paint.color may be `StyleRef` after a
  // theme swatch pick. `useResolveSharedColor` walks the cascade per item
  // before equality, so the picker receives CSS strings and "Mixed"
  // detection works on semantic identity.
  const fillColor = useResolveSharedColor(items, (it) => {
    const f = (it.attrs as unknown as ShapeAttrs).fill;
    return f.type === "solid" ? f.color : "#000000";
  });
  const strokeColor = useResolveSharedColor(items, (it) => {
    const s = (it.attrs as unknown as ShapeAttrs).stroke;
    return s?.paint.type === "solid" ? s.paint.color : "#000000";
  });
  const opacity = sharedValue<number>(items, (it) => (it.attrs as unknown as ShapeAttrs).opacity);
  const fillIsMediaUniform = !isMixed(fillType) && (fillType === "image" || fillType === "video");
  const fillMediaSrc = sharedValue<string>(items, (it) => {
    const f = (it.attrs as unknown as ShapeAttrs).fill;
    return f.type === "image" || f.type === "video" ? f.src : "";
  });

  return (
    <>
      <Bar.Section label="Shape" priority={100}>
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
            options={
              SHAPE_SUB_KIND_OPTIONS as unknown as ReadonlyArray<{
                value: ShapeSubKind;
                label: string;
              }>
            }
            aria-label="Shape sub-kind"
          />
          <MixedBadge visible={isMixed(shape)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Fill" priority={90}>
        {fillIsMediaUniform && !isMixed(fillMediaSrc) ? (
          <div className="inline-flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="md"
              onClick={() => onEditShapeFill?.(fillType as "image" | "video", fillMediaSrc)}
              data-testid="shape-fill-media-edit"
              aria-label={fillType === "image" ? "이미지 채우기 편집" : "비디오 채우기 편집"}
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
              value={isMixed(fillColor) ? "#cccccc" : (fillColor ?? "#000000")}
              onValueCommit={(v) =>
                updateAll(editor, ids, (prev) => ({
                  attrs: {
                    ...prev.attrs,
                    fill: { type: "solid", color: pickerValueToStored(v) },
                  } as unknown as Readonly<Record<string, unknown>>,
                }))
              }
              onValueChange={() => {
                /* commit-only */
              }}
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
      <Bar.Section label="Stroke" priority={80}>
        <div className="inline-flex items-center">
          <ColorPicker
            value={isMixed(strokeColor) ? "#cccccc" : (strokeColor ?? "#000000")}
            onValueCommit={(v) =>
              updateAll(editor, ids, (prev) => {
                const prevAttrs = prev.attrs as unknown as ShapeAttrs;
                const storedColor = pickerValueToStored(v);
                const existingStroke = prevAttrs.stroke ?? {
                  paint: { type: "solid" as const, color: storedColor },
                  width: 2,
                };
                return {
                  attrs: {
                    ...prev.attrs,
                    stroke: {
                      ...existingStroke,
                      paint: { type: "solid", color: storedColor },
                    },
                  } as unknown as Readonly<Record<string, unknown>>,
                };
              })
            }
            onValueChange={() => {
              /* commit-only */
            }}
          />
          <MixedBadge visible={isMixed(strokeColor)} />
        </div>
      </Bar.Section>
      <Bar.Divider />
      <Bar.Section label="Opacity" priority={50}>
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
};
