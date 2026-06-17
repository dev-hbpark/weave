// WI-243 / DR-160 — line content ViewModel (per-item, content surface).
//
// Owns the line's paint resolution (stroke unit → resolved color via the cascade
// hook, default hairline), the endpoint-marker color, shadow + opacity, and the
// SVG prop bundles. The container box is a DOM measurement (ResizeObserver) the
// View owns; the VM stays DOM-less and exposes `geometryFor(bbox)` — a pure
// projector the View calls with its measured box. So the View binds to the vm
// only (never reads `item.*`) while DOM measurement stays in the View.

import {
  type Item as AgocraftItem,
  findUnitInItem,
  lineToSvgGeometry,
  OPACITY_UNIT_KIND,
  paintToSvgFill,
  SHADOW_UNIT_KIND,
  STROKE_UNIT_KIND,
  type StrokeSpec,
  strokeToSvgAttrs,
} from "@agocraft/core";
import { type CSSProperties, type SVGAttributes, useId } from "react";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem } from "../types.js";
import { svgStrokeToReactProps } from "./svg-stroke-props.js";

type LineGeom = ReturnType<typeof lineToSvgGeometry>;

export interface LineItemVm {
  readonly style: CSSProperties;
  readonly fillProps: SVGAttributes<SVGElement>;
  readonly strokeProps: SVGAttributes<SVGElement>;
  /** Pure projector — the View measures its container box (DOM) and asks the VM
   *  for the SVG geometry. Keeps DOM measurement in the View, derivation here. */
  readonly geometryFor: (bbox: { width: number; height: number }) => LineGeom;
}

const DEFAULT_LINE_STROKE = "#1f2933";

export function useLineItemViewModel(item: AgoItem<"line">): LineItemVm {
  const a = item.attrs;
  const uid = useId();
  const itemRef = item as unknown as AgocraftItem;

  // Stroke is the line's PRIMARY paint (decoration.stroke unit). Resolve a
  // StyleRef color via the cascade. No explicit stroke → visible hairline.
  const stroke = findUnitInItem(itemRef, STROKE_UNIT_KIND)?.attrs as StrokeSpec | undefined;
  const strokeColorRaw = stroke?.paint.type === "solid" ? stroke.paint.color : undefined;
  const resolvedColor = useResolveColor(strokeColorRaw, itemRef, undefined);
  const resolvedStroke =
    stroke?.paint.type === "solid" && resolvedColor !== undefined
      ? { ...stroke, paint: { ...stroke.paint, color: resolvedColor } }
      : stroke;
  const strokeId = `${uid}-stroke`;
  const strokeFill = resolvedStroke ? paintToSvgFill(resolvedStroke.paint, strokeId) : null;
  const strokeAttrs =
    resolvedStroke && strokeFill ? strokeToSvgAttrs(resolvedStroke, strokeFill.value) : null;

  const fillProps: SVGAttributes<SVGElement> = { fill: "none" };
  const strokeProps: SVGAttributes<SVGElement> = strokeAttrs
    ? svgStrokeToReactProps(strokeAttrs)
    : {
        stroke: DEFAULT_LINE_STROKE,
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      };

  // Endpoint markers inherit `currentColor`; match the line's solid color.
  const markerColor =
    resolvedStroke?.paint.type === "solid"
      ? (resolvedColor ?? DEFAULT_LINE_STROKE)
      : DEFAULT_LINE_STROKE;

  const shadowSpec = findUnitInItem(itemRef, SHADOW_UNIT_KIND)?.attrs as
    | { x: number; y: number; blur: number; color: string }
    | undefined;
  const shadow = shadowSpec
    ? `${shadowSpec.x}px ${shadowSpec.y}px ${Math.max(0, shadowSpec.blur)}px ${shadowSpec.color}`
    : undefined;
  const opacity =
    (findUnitInItem(itemRef, OPACITY_UNIT_KIND)?.attrs as { value: number } | undefined)?.value ??
    1;

  const style: CSSProperties = {
    opacity,
    color: markerColor,
    filter: shadow ? `drop-shadow(${shadow})` : undefined,
  };

  return { style, fillProps, strokeProps, geometryFor: (bbox) => lineToSvgGeometry(a, bbox) };
}
