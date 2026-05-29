// WI-020 Phase 3 — ShapeBlock renderer.
//
// Reads ShapeAttrs (DR-023 / DR-024) and renders an `<svg>` with the
// element + props from `shapeToSvgGeometry`. Fill/stroke are converted via
// `paintToSvgFill` so gradients land in `<defs>`. Arrow markers also live
// in `<defs>`.

import type { Item as AgocraftItem, ShadowSpec } from "@agocraft/core";
import {
  type ArrowHeadStyle,
  findUnitInItem,
  paintToSvgFill,
  SHADOW_UNIT_KIND,
  shadowToCss,
  shapeToSvgGeometry,
  strokeToSvgAttrs,
} from "@agocraft/core";
import { type SVGAttributes, useEffect, useId, useRef, useState } from "react";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem, ShapeAttrs } from "../types.js";

interface ShapeBlockProps {
  readonly item: AgoItem<"shape">;
  readonly onUpdate?: (patch: Partial<ShapeAttrs>) => void;
}

// Marker geometry definitions for arrow heads (DR-024).
function ArrowMarker({
  id,
  style,
  size,
  orient,
}: {
  id: string;
  style: ArrowHeadStyle;
  size: number;
  orient: "auto" | "auto-start-reverse";
}): JSX.Element | null {
  // marker uses viewBox 0..size, refX = size to anchor to line endpoint.
  switch (style) {
    case "none":
      return null;
    case "triangle":
      return (
        <marker
          id={id}
          markerWidth={size}
          markerHeight={size}
          refX={size}
          refY={size / 2}
          orient={orient}
          markerUnits="userSpaceOnUse"
        >
          <path d={`M 0 0 L ${size} ${size / 2} L 0 ${size} z`} fill="currentColor" />
        </marker>
      );
    case "open":
      return (
        <marker
          id={id}
          markerWidth={size}
          markerHeight={size}
          refX={size}
          refY={size / 2}
          orient={orient}
          markerUnits="userSpaceOnUse"
        >
          <path
            d={`M 0 0 L ${size} ${size / 2} L 0 ${size}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </marker>
      );
    case "diamond":
      return (
        <marker
          id={id}
          markerWidth={size}
          markerHeight={size}
          refX={size}
          refY={size / 2}
          orient={orient}
          markerUnits="userSpaceOnUse"
        >
          <path
            d={`M 0 ${size / 2} L ${size / 2} 0 L ${size} ${size / 2} L ${size / 2} ${size} z`}
            fill="currentColor"
          />
        </marker>
      );
    case "circle":
      return (
        <marker
          id={id}
          markerWidth={size}
          markerHeight={size}
          refX={size / 2}
          refY={size / 2}
          orient={orient}
          markerUnits="userSpaceOnUse"
        >
          <circle cx={size / 2} cy={size / 2} r={size / 2} fill="currentColor" />
        </marker>
      );
  }
}

// Convert a SvgGeometry element + props into a JSX node with fill/stroke
// applied.
function renderGeometryElement(
  element: string,
  props: Record<string, string | number>,
  fillProps: SVGAttributes<SVGElement>,
  strokeProps: SVGAttributes<SVGElement>,
): JSX.Element {
  const merged = { ...props, ...fillProps, ...strokeProps };
  switch (element) {
    case "rect":
      return <rect {...(merged as SVGAttributes<SVGRectElement>)} />;
    case "ellipse":
      return <ellipse {...(merged as SVGAttributes<SVGEllipseElement>)} />;
    case "line":
      return <line {...(merged as SVGAttributes<SVGLineElement>)} />;
    case "polygon":
      return <polygon {...(merged as SVGAttributes<SVGPolygonElement>)} />;
    case "polyline":
      return <polyline {...(merged as SVGAttributes<SVGPolylineElement>)} />;
    case "path":
      return <path {...(merged as SVGAttributes<SVGPathElement>)} />;
    default:
      return <path {...(merged as SVGAttributes<SVGPathElement>)} />;
  }
}

export function ShapeBlock({ item, onUpdate }: ShapeBlockProps): JSX.Element {
  void onUpdate;
  const a = item.attrs;
  const uid = useId();

  // Track the actual rendered size of the SVG container so the geometry
  // is computed in the frame's true aspect — without this, shapes with
  // intrinsic aspect (star, polygon, heart, triangle, speech-bubble) get
  // squashed when the frame is non-square because the viewBox would be
  // fixed at 100×100 and `preserveAspectRatio="none"` would stretch.
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
  const geom = shapeToSvgGeometry(a, bbox);

  // WI-040 — `fill.color` and `stroke.paint.color` may be `StyleRef`
  // objects (theme tokens) after the shape-section picker commit. Resolve
  // via the cascade hook so the SVG fill/stroke gets a CSS string. For
  // non-solid paints the resolver call is a no-op (returns the original
  // type-erased value), and the substitution only touches the `.color`
  // field when present.
  const itemRef = item as unknown as AgocraftItem;
  const fillColorRaw = a.fill.type === "solid" ? (a.fill as { color?: unknown }).color : undefined;
  const resolvedFillColor = useResolveColor(fillColorRaw, itemRef, undefined);
  const resolvedFill =
    a.fill.type === "solid" && resolvedFillColor !== undefined
      ? { ...a.fill, color: resolvedFillColor }
      : a.fill;
  const strokeColorRaw =
    a.stroke?.paint.type === "solid" ? (a.stroke.paint as { color?: unknown }).color : undefined;
  const resolvedStrokeColor = useResolveColor(strokeColorRaw, itemRef, undefined);
  const resolvedStroke =
    a.stroke?.paint.type === "solid" && resolvedStrokeColor !== undefined
      ? { ...a.stroke, paint: { ...a.stroke.paint, color: resolvedStrokeColor } }
      : a.stroke;

  const fillId = `${uid}-fill`;
  const fill = paintToSvgFill(resolvedFill, fillId);
  const strokeId = `${uid}-stroke`;
  const strokeFill = resolvedStroke ? paintToSvgFill(resolvedStroke.paint, strokeId) : null;
  const strokeAttrs =
    resolvedStroke && strokeFill ? strokeToSvgAttrs(resolvedStroke, strokeFill.value) : null;

  const fillProps: SVGAttributes<SVGElement> = { fill: fill.value };
  const strokeProps: SVGAttributes<SVGElement> = strokeAttrs
    ? (strokeAttrs as unknown as SVGAttributes<SVGElement>)
    : {};

  // DR-028 — prefer the decoration.shadow UNIT; fall back to the legacy
  // attrs.shadow until that attr is migrated away.
  const shadowSpec =
    (findUnitInItem(itemRef, SHADOW_UNIT_KIND)?.attrs as ShadowSpec | undefined) ??
    a.shadow ??
    undefined;
  const shadow = shadowSpec ? shadowToCss(shadowSpec) : undefined;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ opacity: a.opacity, filter: shadow ? `drop-shadow(${shadow})` : undefined }}
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
          {fill.defs && fill.defs.type === "linear" ? (
            <linearGradient
              id={fill.defs.id}
              gradientTransform={
                fill.defs.angle !== undefined ? `rotate(${fill.defs.angle} 0.5 0.5)` : undefined
              }
            >
              {fill.defs.stops.map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : null}
          {fill.defs && fill.defs.type === "radial" ? (
            <radialGradient id={fill.defs.id} cx={fill.defs.cx} cy={fill.defs.cy} r={0.5}>
              {fill.defs.stops.map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </radialGradient>
          ) : null}
          {/* WI-020 — Figma-style image fill via SVG <pattern>+<image>. The
              pattern fills its bounding box; preserveAspectRatio on the
              inner <image> emulates CSS object-fit. */}
          {fill.defs && fill.defs.type === "image-pattern" ? (
            <pattern id={fill.defs.id} patternUnits="objectBoundingBox" width="1" height="1">
              <image
                href={fill.defs.src}
                x={0}
                y={0}
                width={bbox.width}
                height={bbox.height}
                preserveAspectRatio={
                  fill.defs.fit === "contain"
                    ? "xMidYMid meet"
                    : fill.defs.fit === "fill"
                      ? "none"
                      : fill.defs.fit === "tile"
                        ? "xMidYMid slice"
                        : "xMidYMid slice"
                }
                opacity={fill.defs.opacity}
              />
            </pattern>
          ) : null}
          {/* Video-fill clip path — the shape's geometry becomes the clip
              for the foreignObject-hosted <video> rendered below. */}
          {fill.videoFill ? (
            <clipPath id={`${uid}-video-clip`} clipPathUnits="userSpaceOnUse">
              {renderGeometryElement(geom.element, geom.props, { fill: "black" }, {})}
            </clipPath>
          ) : null}
          {strokeFill?.defs && strokeFill.defs.type === "linear" ? (
            <linearGradient id={strokeFill.defs.id}>
              {strokeFill.defs.stops.map((s, i) => (
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : null}
          {geom.markers?.map((m) => (
            <ArrowMarker key={m.id} id={m.id} style={m.style} size={m.size} orient={m.orient} />
          ))}
        </defs>
        {/* Shape geometry — filled with the resolved paint (solid /
            gradient / image url-pattern / "transparent" for video). */}
        {renderGeometryElement(geom.element, geom.props, fillProps, strokeProps)}
        {/* Video fill — render a foreignObject containing the <video>
            element, clipped by the shape's geometry. The <video> auto-
            plays muted by default (Figma default + browser policy). */}
        {fill.videoFill ? (
          <foreignObject
            x={0}
            y={0}
            width={bbox.width}
            height={bbox.height}
            clipPath={`url(#${uid}-video-clip)`}
            style={{ opacity: fill.videoFill.opacity }}
          >
            <video
              src={fill.videoFill.src}
              autoPlay={fill.videoFill.muted}
              muted={fill.videoFill.muted}
              loop={fill.videoFill.loop}
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit:
                  fill.videoFill.fit === "contain"
                    ? "contain"
                    : fill.videoFill.fit === "fill"
                      ? "fill"
                      : "cover",
                display: "block",
                pointerEvents: "none",
              }}
            />
          </foreignObject>
        ) : null}
      </svg>
    </div>
  );
}
