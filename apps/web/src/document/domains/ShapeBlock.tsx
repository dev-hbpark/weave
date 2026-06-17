// WI-020 Phase 3 — shape content View.
//
// WI-243 / DR-160 — split into ViewModel + pure View. Paint resolution, gradient/
// image/video `paintToSvgFill` results, shadow/opacity, and the SVG ids live in
// `shape-item-view-model.ts`; `ShapeView` renders from `{ vm }` ONLY (never reads
// `item.*`). The container box is a DOM measurement the View owns (ResizeObserver)
// and feeds to `vm.geometryFor` / `vm.paintPropsFor`.
//
// `ArrowMarker` + `renderGeometryElement` are shared render helpers (LineBlock
// reuses them) and stay exported from this module.

import type { ArrowHeadStyle } from "@agocraft/core";
import { type JSX, type SVGAttributes, useEffect, useRef, useState } from "react";
import type { AgoItem, ShapeAttrs } from "../types.js";
import { type ShapeItemVm, useShapeItemViewModel } from "./shape-item-view-model.js";

interface ShapeBlockProps {
  readonly item: AgoItem<"shape">;
  readonly onUpdate?: (patch: Partial<ShapeAttrs>) => void;
}

// Marker geometry definitions for arrow heads (DR-024).
export function ArrowMarker({
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

// Convert a SvgGeometry element + props into a JSX node with fill/stroke applied.
export function renderGeometryElement(
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

/** Pure content View for a shape item — renders from `{ vm }` ONLY. Owns the
 *  DOM-measured container box (shapes with intrinsic aspect must compute geometry
 *  in the frame's true aspect) and asks the VM's pure projectors for geometry +
 *  paint props. */
export function ShapeView({ vm }: { readonly vm: ShapeItemVm }): JSX.Element {
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

  const geom = vm.geometryFor(bbox);
  const { fillProps, strokeProps } = vm.paintPropsFor(geom);
  const { fill, strokeFill } = vm;

  return (
    <div ref={containerRef} className="relative h-full w-full" style={vm.style}>
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
                // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : null}
          {fill.defs && fill.defs.type === "radial" ? (
            <radialGradient id={fill.defs.id} cx={fill.defs.cx} cy={fill.defs.cy} r={0.5}>
              {fill.defs.stops.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </radialGradient>
          ) : null}
          {/* WI-020 — Figma-style image fill via SVG <pattern>+<image>. */}
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
          {/* Video-fill clip path — the shape's geometry clips the video below. */}
          {fill.videoFill ? (
            <clipPath id={vm.videoClipId} clipPathUnits="userSpaceOnUse">
              {renderGeometryElement(geom.element, geom.props, { fill: "black" }, {})}
            </clipPath>
          ) : null}
          {strokeFill?.defs && strokeFill.defs.type === "linear" ? (
            <linearGradient id={strokeFill.defs.id}>
              {strokeFill.defs.stops.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
                <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : null}
          {geom.markers?.map((m) => (
            <ArrowMarker key={m.id} id={m.id} style={m.style} size={m.size} orient={m.orient} />
          ))}
        </defs>
        {/* Shape geometry — filled with the resolved paint. */}
        {renderGeometryElement(geom.element, geom.props, fillProps, strokeProps)}
        {/* Video fill — foreignObject <video> clipped by the shape geometry. */}
        {fill.videoFill ? (
          <foreignObject
            x={0}
            y={0}
            width={bbox.width}
            height={bbox.height}
            clipPath={`url(#${vm.videoClipId})`}
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

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function ShapeBlock({ item }: ShapeBlockProps): JSX.Element {
  const vm = useShapeItemViewModel(item);
  return <ShapeView vm={vm} />;
}
