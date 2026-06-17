// WI-032 — frame content View: the canvas container of the frame-only paradigm.
//
// Renders no visible content of its own — just the frame's PAINT (background fill
// + border stroke + corner radius). Child Items are recursed + laid out by
// FrameSurface (agocraft). DR-028 — fill/stroke are decoration UNITS, painted via
// the SAME SVG machinery shapes use (gradient/image/video fills render identically).
//
// WI-243 / DR-160 — split into ViewModel + pure View. Paint resolution + the rect
// prop bundles + `hasUnitPaint` live in `frame-item-view-model.ts`; `FrameView`
// renders from `{ vm }` ONLY (never reads `item.*`). The screen box + unscaled
// design box are DOM measurements the View owns and feeds to `vm.geometryFor`.

import { type JSX, type SVGAttributes, useEffect, useRef, useState } from "react";
import type { AgoItem } from "../types.js";
import {
  type FrameFill,
  type FrameItemVm,
  useFrameItemViewModel,
} from "./frame-item-view-model.js";

interface FrameBlockProps {
  readonly item: AgoItem<"frame">;
}

/** Inline the `<defs>` payload `paintToSvgFill` asks for (gradient / image).
 *  Shared by the fill and stroke paints. Returns null for solid paints. */
function PaintDefs({
  defs,
  bbox,
}: {
  readonly defs: FrameFill["defs"];
  readonly bbox: { width: number; height: number };
}): JSX.Element | null {
  if (defs === undefined) return null;
  if (defs.type === "linear") {
    return (
      <linearGradient
        id={defs.id}
        gradientTransform={defs.angle !== undefined ? `rotate(${defs.angle} 0.5 0.5)` : undefined}
      >
        {defs.stops.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
          <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
        ))}
      </linearGradient>
    );
  }
  if (defs.type === "radial") {
    return (
      <radialGradient id={defs.id} cx={defs.cx} cy={defs.cy} r={0.5}>
        {defs.stops.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list with stable order — the array index is a valid, stable key here
          <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
        ))}
      </radialGradient>
    );
  }
  // image-pattern — fills the rect bounding box; preserveAspectRatio on the inner
  // <image> emulates CSS object-fit (same mapping as ShapeBlock).
  return (
    <pattern id={defs.id} patternUnits="objectBoundingBox" width="1" height="1">
      <image
        href={defs.src}
        x={0}
        y={0}
        width={bbox.width}
        height={bbox.height}
        preserveAspectRatio={
          defs.fit === "contain" ? "xMidYMid meet" : defs.fit === "fill" ? "none" : "xMidYMid slice"
        }
        opacity={defs.opacity}
      />
    </pattern>
  );
}

/** Pure content View for a frame item — renders from `{ vm }` ONLY. Owns the
 *  DOM-measured screen box + unscaled design box (the corner-radius fraction
 *  denominator) and asks `vm.geometryFor` for the rounded-rect geometry. */
export function FrameView({ vm }: { readonly vm: FrameItemVm }): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bbox, setBbox] = useState<{ width: number; height: number }>({ width: 100, height: 100 });
  const [designBox, setDesignBox] = useState<{ width: number; height: number }>({
    width: 100,
    height: 100,
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      setBbox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      const dw = Math.max(1, el.offsetWidth);
      const dh = Math.max(1, el.offsetHeight);
      setDesignBox((prev) =>
        prev.width === dw && prev.height === dh ? prev : { width: dw, height: dh },
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = vm.geometryFor(bbox, designBox);
  const { fill, strokeFill } = vm;

  /** The rounded frame box — a per-corner `<path>` when `cornerRadii` is set,
   *  else the uniform `<rect rx/ry>`. Same fill/stroke props feed either. */
  const RoundedBox = (props: SVGAttributes<SVGElement>): JSX.Element =>
    g.perCornerPathD !== null ? (
      <path transform={`translate(${g.inset} ${g.inset})`} d={g.perCornerPathD} {...props} />
    ) : (
      <rect
        x={g.inset}
        y={g.inset}
        width={g.rectW}
        height={g.rectH}
        rx={g.rx}
        ry={g.ry}
        {...props}
      />
    );

  return (
    <div
      ref={containerRef}
      data-testid="frame-block"
      data-frame-kind="frame"
      className="absolute inset-0 pointer-events-none"
    >
      {vm.hasUnitPaint ? (
        <svg
          viewBox={`0 0 ${bbox.width} ${bbox.height}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: "block", overflow: "visible" }}
        >
          <defs>
            {fill?.defs ? <PaintDefs defs={fill.defs} bbox={bbox} /> : null}
            {strokeFill?.defs ? <PaintDefs defs={strokeFill.defs} bbox={bbox} /> : null}
            {/* Video-fill clip — the frame rect (rounded) clips the <video> below
                so a video background respects cornerRadius. */}
            {fill?.videoFill ? (
              <clipPath id={vm.videoClipId} clipPathUnits="userSpaceOnUse">
                <RoundedBox fill="black" />
              </clipPath>
            ) : null}
          </defs>
          <RoundedBox {...vm.rectFillProps} {...vm.rectStrokeProps} />
          {/* Video fill — foreignObject <video> clipped to the frame rect. */}
          {fill?.videoFill ? (
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
      ) : null}
    </div>
  );
}

/** Registered renderer. Thin shim: resolve the ViewModel, render the pure View.
 *  WI-243 transitional — Phase-0 facet will register `useViewModel`/`view`. */
export function FrameBlock({ item }: FrameBlockProps): JSX.Element {
  const vm = useFrameItemViewModel(item);
  return <FrameView vm={vm} />;
}
