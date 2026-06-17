// WI-020 + WI-243 / DR-160 — shape content ViewModel (per-item, content surface).
//
// Owns paint resolution (fill/stroke decoration units → resolved colors via the
// cascade hook, gradient/image/video `paintToSvgFill` results), shadow + opacity,
// and the stable SVG ids. The container box is a DOM measurement the View owns
// (ResizeObserver — shapes with intrinsic aspect must compute geometry in the
// frame's true aspect); the VM stays DOM-less and exposes two pure projectors —
// `geometryFor(bbox)` and `paintPropsFor(geom)` — so the View binds to `{ vm }`
// only while DOM measurement stays in the View.

import {
  type Item as AgocraftItem,
  DEFAULT_SHAPE_FILL_PAINT,
  FILL_UNIT_KIND,
  findUnitInItem,
  OPACITY_UNIT_KIND,
  type PaintSpec,
  paintToSvgFill,
  SHADOW_UNIT_KIND,
  type ShadowSpec,
  STROKE_UNIT_KIND,
  type StrokeSpec,
  shapeToSvgGeometry,
  strokeToSvgAttrs,
} from "@agocraft/core";
import { type CSSProperties, type SVGAttributes, useId } from "react";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem } from "../types.js";
import { svgStrokeToReactProps } from "./svg-stroke-props.js";

type ShapeGeom = ReturnType<typeof shapeToSvgGeometry>;
type SvgFill = ReturnType<typeof paintToSvgFill>;

export interface ShapeItemVm {
  readonly style: CSSProperties;
  /** `paintToSvgFill` result — `value` (fill string / url), `defs` (gradient /
   *  image-pattern), `videoFill` (foreignObject video). Read by the View. */
  readonly fill: SvgFill;
  readonly strokeFill: SvgFill | null;
  /** `${uid}-video-clip` — the clipPath id used both for the def and the ref. */
  readonly videoClipId: string;
  /** Pure projector — the View measures its box (DOM) and asks for geometry. */
  readonly geometryFor: (bbox: { width: number; height: number }) => ShapeGeom;
  /** Pure projector — fill/stroke SVG props for the (bbox-dependent) geometry. */
  readonly paintPropsFor: (geom: ShapeGeom) => {
    fillProps: SVGAttributes<SVGElement>;
    strokeProps: SVGAttributes<SVGElement>;
  };
}

export function useShapeItemViewModel(item: AgoItem<"shape">): ShapeItemVm {
  const a = item.attrs;
  const uid = useId();
  const itemRef = item as unknown as AgocraftItem;

  // DR-028 — fill / stroke are decoration UNITS (no legacy attr fallback). A
  // shape with no fill unit renders the default paint.
  const effectiveFill: PaintSpec =
    (findUnitInItem(itemRef, FILL_UNIT_KIND)?.attrs as PaintSpec | undefined) ??
    DEFAULT_SHAPE_FILL_PAINT;
  const effectiveStroke = findUnitInItem(itemRef, STROKE_UNIT_KIND)?.attrs as
    | StrokeSpec
    | undefined;
  // WI-040 — colors may be StyleRef tokens; resolve via the cascade (no-op for
  // non-solid paints; only substitutes the `.color` field when present).
  const fillColorRaw =
    effectiveFill.type === "solid" ? (effectiveFill as { color?: unknown }).color : undefined;
  const resolvedFillColor = useResolveColor(fillColorRaw, itemRef, undefined);
  const resolvedFill =
    effectiveFill.type === "solid" && resolvedFillColor !== undefined
      ? { ...effectiveFill, color: resolvedFillColor }
      : effectiveFill;
  const strokeColorRaw =
    effectiveStroke?.paint.type === "solid"
      ? (effectiveStroke.paint as { color?: unknown }).color
      : undefined;
  const resolvedStrokeColor = useResolveColor(strokeColorRaw, itemRef, undefined);
  const resolvedStroke =
    effectiveStroke?.paint.type === "solid" && resolvedStrokeColor !== undefined
      ? { ...effectiveStroke, paint: { ...effectiveStroke.paint, color: resolvedStrokeColor } }
      : effectiveStroke;

  const fillId = `${uid}-fill`;
  const fill = paintToSvgFill(resolvedFill, fillId);
  const strokeId = `${uid}-stroke`;
  const strokeFill = resolvedStroke ? paintToSvgFill(resolvedStroke.paint, strokeId) : null;
  const strokeAttrs =
    resolvedStroke && strokeFill ? strokeToSvgAttrs(resolvedStroke, strokeFill.value) : null;

  // DR-028 — shadow / opacity decoration units. Shapes use CSS drop-shadow so the
  // shadow follows the SVG silhouette; built directly from the spec (drop-shadow
  // has no spread/inset, unlike box-shadow).
  const shadowSpec = findUnitInItem(itemRef, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined;
  const shadow = shadowSpec
    ? `${shadowSpec.x}px ${shadowSpec.y}px ${Math.max(0, shadowSpec.blur)}px ${shadowSpec.color}`
    : undefined;
  const opacity =
    (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
    1;

  const style: CSSProperties = {
    opacity,
    filter: shadow ? `drop-shadow(${shadow})` : undefined,
  };

  // Stroke-only geometry (`line` / open `polyline`) has no fill region: paint the
  // outline as a stroke (the fill paint becomes the line colour when no explicit
  // stroke unit is set). Depends on `geom`, so it is a per-bbox projector.
  const paintPropsFor = (geom: ShapeGeom) => {
    const isStrokeOnly =
      geom.strokeOnly === true || geom.element === "line" || geom.element === "polyline";
    const fillProps: SVGAttributes<SVGElement> = { fill: isStrokeOnly ? "none" : fill.value };
    const strokeProps: SVGAttributes<SVGElement> = strokeAttrs
      ? svgStrokeToReactProps(strokeAttrs)
      : isStrokeOnly
        ? { stroke: fill.value, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }
        : {};
    return { fillProps, strokeProps };
  };

  return {
    style,
    fill,
    strokeFill,
    videoClipId: `${uid}-video-clip`,
    geometryFor: (bbox) => shapeToSvgGeometry(a, bbox),
    paintPropsFor,
  };
}
