// DR-025 / WI-062 — LineBlock renderer for the `line` item kind.
//
// A line is STROKE-ONLY (no fill): `lineToSvgGeometry` returns a <polyline>
// (straight) or <path> (smooth) with `strokeOnly:true` plus optional endpoint
// markers. The stroke paint comes from the item's `decoration.stroke` UNIT;
// with none set we fall back to a visible hairline so a freshly-created line
// isn't invisible. Reuses ShapeBlock's `ArrowMarker` + `renderGeometryElement`.

import type { Item as AgocraftItem, StrokeSpec } from "@agocraft/core";
import {
  findUnitInItem,
  lineToSvgGeometry,
  OPACITY_UNIT_KIND,
  paintToSvgFill,
  SHADOW_UNIT_KIND,
  STROKE_UNIT_KIND,
  strokeToSvgAttrs,
} from "@agocraft/core";
import { type SVGAttributes, useEffect, useId, useRef, useState } from "react";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem, LineAttrs } from "../types.js";
import { ArrowMarker, renderGeometryElement } from "./ShapeBlock.js";

interface LineBlockProps {
  readonly item: AgoItem<"line">;
  readonly onUpdate?: (patch: Partial<LineAttrs>) => void;
}

const DEFAULT_LINE_STROKE = "#1f2933";

export function LineBlock({ item, onUpdate }: LineBlockProps): JSX.Element {
  void onUpdate;
  const a = item.attrs;
  const uid = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bbox, setBbox] = useState<{ width: number; height: number }>({ width: 100, height: 100 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      setBbox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = lineToSvgGeometry(a, bbox);
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
    ? (strokeAttrs as unknown as SVGAttributes<SVGElement>)
    : { stroke: DEFAULT_LINE_STROKE, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ opacity, color: markerColor, filter: shadow ? `drop-shadow(${shadow})` : undefined }}
    >
      <svg
        viewBox={`0 0 ${bbox.width} ${bbox.height}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {geom.markers?.map((m) => (
            <ArrowMarker key={m.id} id={m.id} style={m.style} size={m.size} orient={m.orient} />
          ))}
        </defs>
        {renderGeometryElement(geom.element, geom.props, fillProps, strokeProps)}
      </svg>
    </div>
  );
}
