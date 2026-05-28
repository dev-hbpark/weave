// DR-design-015 — shape kind in Tier-2 layout.
//
// Quick: fill swatch + stroke swatch (the two highest-frequency shape
// edits). More: Shape sub-kind picker, Opacity, image/video fill ops.

import type { ShapeAttrs, ShapeSubKind } from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  ColorPicker,
  IconClose,
  IconImage,
  IconShape,
  IconShapeArrow,
  IconShapeEllipse,
  IconShapeHeart,
  IconShapeLine,
  IconShapePolygon,
  IconShapeRectangle,
  IconShapeStar,
  IconShapeTriangle,
  IconVideo,
  NumberSlider,
  Select,
} from "@weave/design-system";
import type { ReactNode } from "react";
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

// Shape sub-kind options — 8 kinds with design-system icons (icons-only
// rule). 8 > the segmented-control sweet spot (≤6), so this is a Combobox.
// Order matches agocraft's enumeration.
const SHAPE_SUB_KIND_OPTIONS = [
  { value: "rectangle", label: "사각형", icon: <IconShapeRectangle size={15} /> },
  { value: "ellipse", label: "원", icon: <IconShapeEllipse size={15} /> },
  { value: "line", label: "선", icon: <IconShapeLine size={15} /> },
  { value: "arrow", label: "화살표", icon: <IconShapeArrow size={15} /> },
  { value: "triangle", label: "삼각형", icon: <IconShapeTriangle size={15} /> },
  { value: "star", label: "별", icon: <IconShapeStar size={15} /> },
  { value: "polygon", label: "다각형", icon: <IconShapePolygon size={15} /> },
  { value: "heart", label: "하트", icon: <IconShapeHeart size={15} /> },
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
      <Bar.Kind icon={<IconShape size={18} />} label="Shape" />
      <Bar.Quick>
        {/* Fill swatch — opens picker on click. Multi-aware + StyleRef
            cascade-resolved via useResolveSharedColor. */}
        <ColorPicker
          aria-label="채우기"
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
        {/* Stroke swatch */}
        <ColorPicker
          aria-label="윤곽선"
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
        <MixedBadge visible={isMixed(fillColor) || isMixed(strokeColor)} />
      </Bar.Quick>
      <Bar.More>
        <Bar.Field label="Shape">
          <Select<ShapeSubKind>
            value={isMixed(shape) ? "" : shape}
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
                icon?: ReactNode;
              }>
            }
            aria-label="Shape sub-kind"
            placeholder="여러 모양"
            triggerClassName="w-full"
          />
          <MixedBadge visible={isMixed(shape)} />
        </Bar.Field>
        <Bar.Field label="Fill">
          {fillIsMediaUniform && !isMixed(fillMediaSrc) ? (
            <div className="flex items-center gap-1.5 w-full">
              <Button
                variant="ghost"
                size="md"
                onClick={() => onEditShapeFill?.(fillType as "image" | "video", fillMediaSrc)}
                data-testid="shape-fill-media-edit"
                aria-label={fillType === "image" ? "이미지 채우기 편집" : "비디오 채우기 편집"}
                className="flex-1 justify-start gap-1.5"
              >
                {fillType === "image" ? <IconImage size={14} /> : <IconVideo size={14} />}
                <span>{truncateUrl(fillMediaSrc)}</span>
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
                data-tip="채우기 비우기"
              >
                <IconClose size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <ColorPicker
                aria-label="채우기 색상"
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
                data-tip="이미지로 채우기"
              >
                <IconImage size={14} />
              </Button>
              <Button
                variant="subtle"
                size="md"
                onClick={() => onEditShapeFill?.("video", "")}
                data-testid="shape-fill-video"
                aria-label="비디오로 채우기"
                data-tip="비디오로 채우기"
              >
                <IconVideo size={14} />
              </Button>
            </div>
          )}
        </Bar.Field>
        <Bar.Field label="Stroke">
          <ColorPicker
            aria-label="윤곽선 색상"
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
        </Bar.Field>
        <Bar.Field label="Opacity">
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
            className="w-full"
          />
          <MixedBadge visible={isMixed(opacity)} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
