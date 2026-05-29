// DR-design-015 — shape kind in Tier-2 layout.
//
// Quick: fill swatch + stroke swatch (the two highest-frequency shape
// edits). More: Shape sub-kind picker, Opacity, image/video fill ops.

import type { ShapeAttrs, ShapeSubKind } from "@agocraft/core";
import {
  ContextualToolbar as Bar,
  Button,
  CornerRadiusControl,
  type CornerRadiusValue,
  IconClose,
  IconImage,
  IconShape,
  IconShapeArrow,
  IconShapeEllipse,
  IconShapeHeart,
  IconShapeLine,
  IconShapePoly,
  IconShapePolygon,
  IconShapeRectangle,
  IconShapeStar,
  IconShapeTriangle,
  IconVideo,
  Select,
} from "@weave/design-system";
import type { ReactNode } from "react";
import { isMixed, MixedBadge, sharedValue, truncateUrl, updateAll } from "../multi-edit.js";
import { FillControl, OpacityControl, ShadowControls, StrokeControl } from "./shadow-controls.js";
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
  { value: "poly", label: "자유 다각형", icon: <IconShapePoly size={15} /> },
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
    case "poly":
      // Freeform default = inscribed triangle; reshaped via vertex editing /
      // weave.shape.setVertices.
      return {
        shape: "poly",
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        closed: true,
      };
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
  // WI-056 fill/stroke color editing is now the decoration.fill / decoration.stroke
  // units (FillControl / StrokeControl), reading from the live doc — no per-attr
  // sharedValue color reads here (DR-028).
  // WI-055 — corner radius is rectangle-only. The control renders only when the
  // shared sub-kind is uniformly "rectangle". Read the per-corner radii; compare
  // by component so a 4-tuple match counts as "agree".
  const isRectangleUniform = !isMixed(shape) && shape === "rectangle";
  const cornerRadii = sharedValue<CornerRadiusValue>(
    items,
    (it) => {
      const sa = (it.attrs as unknown as ShapeAttrs).subAttrs;
      return sa.shape === "rectangle" ? sa.cornerRadii : { tl: 0, tr: 0, br: 0, bl: 0 };
    },
    (a, b) => a.tl === b.tl && a.tr === b.tr && a.br === b.br && a.bl === b.bl,
  );
  const fillIsMediaUniform = !isMixed(fillType) && (fillType === "image" || fillType === "video");
  const fillMediaSrc = sharedValue<string>(items, (it) => {
    const f = (it.attrs as unknown as ShapeAttrs).fill;
    return f.type === "image" || f.type === "video" ? f.src : "";
  });

  return (
    <>
      <Bar.Kind icon={<IconShape size={18} />} label="Shape" />
      <Bar.Quick>
        {/* DR-028 — fill is a decoration UNIT (FillControl). Stroke editing lives
            in the More panel's Stroke field (StrokeControl). */}
        <FillControl editor={editor} ids={ids} />
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
              {/* DR-028 — solid/gradient fill via the decoration.fill unit. */}
              <FillControl editor={editor} ids={ids} />
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
        {/* DR-028 — stroke is a decoration unit (color + width). */}
        <Bar.Field label="Stroke">
          <StrokeControl editor={editor} ids={ids} />
        </Bar.Field>
        {/* DR-028 — opacity is a decoration unit (was attrs.opacity). */}
        <Bar.Field label="Opacity">
          <OpacityControl editor={editor} ids={ids} />
        </Bar.Field>
        {isRectangleUniform && (
          <Bar.Field label="Corner radius">
            <CornerRadiusControl
              value={isMixed(cornerRadii) ? { tl: 0, tr: 0, br: 0, bl: 0 } : cornerRadii}
              mixed={isMixed(cornerRadii)}
              onChange={(next) =>
                updateAll(editor, ids, (prev) => {
                  const prevAttrs = prev.attrs as unknown as ShapeAttrs;
                  // Rebuild the COMPLETE subAttrs — the item.attrs reducer
                  // replaces the whole attrs map, so a partial would drop
                  // `shape`. Guard keeps non-rectangles untouched.
                  if (prevAttrs.subAttrs.shape !== "rectangle") {
                    return { attrs: prev.attrs };
                  }
                  return {
                    attrs: {
                      ...prev.attrs,
                      subAttrs: { shape: "rectangle", cornerRadii: next },
                    } as unknown as Readonly<Record<string, unknown>>,
                  };
                })
              }
            />
            <MixedBadge visible={isMixed(cornerRadii)} />
          </Bar.Field>
        )}
        {/* DR-028 — shadow is a decoration UNIT, edited via weave.item.setDecoration. */}
        <Bar.Field label="Shadow">
          <ShadowControls editor={editor} ids={ids} />
        </Bar.Field>
      </Bar.More>
    </>
  );
};
