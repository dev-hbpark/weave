// WI-032 — Frame block: the canvas container of the new paradigm.
//
// Renders no visible content of its own — just the frame's PAINT (background
// fill + border stroke) and an optional border-radius. All visible elements
// inside the frame come from primitive child Items (`text`, `shape`, `image`,
// `video`, nested `frame`). FrameSurface (agocraft) recurses into
// `item.children` and lays them out at their own `frame` rectangles.
//
// DR-028 parity (WI-095 follow-up) — a frame's fill / stroke are decoration
// UNITS (`decoration.fill` = PaintSpec, `decoration.stroke` = StrokeSpec),
// exactly like a shape. This is what the agent-server is told to use
// (weave-capabilities.ts: "set the background with a decoration.fill unit")
// and what the unit schemas advertise: fill/stroke accept solid, gradient,
// image AND video paint. Painting via the SAME `paintToSvgFill` /
// `strokeToSvgAttrs` machinery shapes use means every paint kind — gradient
// fills, gradient strokes, image fills, video fills — renders identically on a
// frame. (A div + CSS can't do gradient borders or clipped video, hence SVG.)
//
// The legacy `attrs.background` field is GONE — `migrate-frame-only.ts` lifts
// it to a `decoration.fill` unit on load, and the toolbar (FillControl /
// StrokeControl) writes units, so this renderer reads units only.
//
// SOLID / GRASP:
//   • SRP — only paints the container chrome (fill + stroke + radius).
//   • Information Expert — knows only its own fill / stroke / corner radius.
//   • OS Rule 6 — no kind/type switch on item kind. Paint-type branching is
//     delegated to agocraft's `paintToSvgFill` (one place owns the PaintSpec
//     union); this component only inlines the `<defs>` it returns.

import {
  type Item as AgocraftItem,
  FILL_UNIT_KIND,
  findUnitInItem,
  type PaintSpec,
  paintToSvgFill,
  STROKE_UNIT_KIND,
  type StrokeSpec,
  strokeToSvgAttrs,
} from "@agocraft/core";
import { type JSX, type SVGAttributes, useEffect, useId, useRef, useState } from "react";
import { type CornerRadii, cornerRadiusPxToFraction, perCornerRectPath } from "../corner-radius.js";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem } from "../types.js";
import { svgStrokeToReactProps } from "./svg-stroke-props.js";

interface FrameBlockProps {
  readonly item: AgoItem<"frame">;
}

/** Inline the `<defs>` payload `paintToSvgFill` asks for (gradient / image).
 *  Shared by the fill and stroke paints. Returns null for solid paints. */
function PaintDefs({
  defs,
  bbox,
}: {
  readonly defs: ReturnType<typeof paintToSvgFill>["defs"];
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
  // image-pattern — fills the rect bounding box; preserveAspectRatio on the
  // inner <image> emulates CSS object-fit (same mapping as ShapeBlock).
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

export function FrameBlock({ item }: FrameBlockProps) {
  const itemRef = item as unknown as AgocraftItem;
  const uid = useId();
  const { cornerRadius } = item.attrs;

  // Measure the true rendered size so the viewBox is 1 user-unit = 1 screen px
  // (preserveAspectRatio="none" then never distorts gradients or corner radii).
  // `designBox` is the UNSCALED layout size (offsetWidth/Height ignore the
  // Stage's CSS `transform: scale`) — the denominator for the corner-radius
  // fraction, since `cornerRadius` is stored in design-px.
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

  // DR-028 — fill / stroke are decoration UNITS.
  const fillUnit = findUnitInItem(itemRef, FILL_UNIT_KIND)?.attrs as PaintSpec | undefined;
  const strokeUnit = findUnitInItem(itemRef, STROKE_UNIT_KIND)?.attrs as StrokeSpec | undefined;

  // WI-040 — resolve StyleRef (theme token) → CSS string for the solid-color
  // fields. Hooks run unconditionally (fixed order) regardless of paint type.
  const fillSolidRaw =
    fillUnit?.type === "solid" ? (fillUnit as { color?: unknown }).color : undefined;
  const resolvedFillSolid = useResolveColor(fillSolidRaw, itemRef, undefined);
  const strokeSolidRaw =
    strokeUnit?.paint.type === "solid"
      ? (strokeUnit.paint as { color?: unknown }).color
      : undefined;
  const resolvedStrokeSolid = useResolveColor(strokeSolidRaw, itemRef, undefined);

  // Fill / stroke paints (solid / gradient / image / video) via SVG.
  const effectiveFill: PaintSpec | undefined =
    fillUnit !== undefined && fillUnit.type === "solid" && resolvedFillSolid !== undefined
      ? { ...fillUnit, color: resolvedFillSolid }
      : fillUnit;
  const resolvedStroke: StrokeSpec | undefined =
    strokeUnit !== undefined &&
    strokeUnit.paint.type === "solid" &&
    resolvedStrokeSolid !== undefined
      ? { ...strokeUnit, paint: { ...strokeUnit.paint, color: resolvedStrokeSolid } }
      : strokeUnit;

  const fill = effectiveFill ? paintToSvgFill(effectiveFill, `${uid}-fill`) : null;
  const strokeFill = resolvedStroke ? paintToSvgFill(resolvedStroke.paint, `${uid}-stroke`) : null;
  const strokeAttrs =
    resolvedStroke && strokeFill ? strokeToSvgAttrs(resolvedStroke, strokeFill.value) : null;

  // Stroke is centered on the rect edge — inset the rect by half its width so
  // the whole border sits INSIDE the frame box (Figma "inside" border feel).
  const sw = resolvedStroke?.width ?? 0;
  const inset = sw / 2;
  const rectW = Math.max(0, bbox.width - sw);
  const rectH = Math.max(0, bbox.height - sw);
  // cornerRadius is an absolute design-px radius, drawn CIRCULAR (rx === ry) and
  // clamped to the half-short side. SVG clamps rx/ry independently, so we apply
  // the clamp ourselves: take the radius as a fraction of the design box's
  // half-short side, then scale that fraction onto the measured screen-px box —
  // identical curvature on both axes at every zoom.
  const radius =
    cornerRadius !== undefined && cornerRadius > 0
      ? cornerRadiusPxToFraction(cornerRadius, designBox.width, designBox.height) *
        (Math.min(rectW, rectH) / 2)
      : undefined;
  const rx = radius;
  const ry = radius;

  // WI-109 — per-corner override: when `cornerRadii` is present the box is drawn
  // as an SVG path (SVG `<rect>` only carries one rx/ry). Each corner's design-px
  // radius is projected to screen-px via the uniform zoom and clamped to the
  // half-short side, so the four arcs never overlap.
  const cornerRadii = (item.attrs as { cornerRadii?: CornerRadii }).cornerRadii;
  const designShort = Math.min(designBox.width, designBox.height);
  const zoom = designShort > 0 ? Math.min(rectW, rectH) / designShort : 1;
  const capScreen = Math.min(rectW, rectH) / 2;
  const screenRadii: CornerRadii | null = cornerRadii
    ? {
        tl: Math.min(Math.max(0, cornerRadii.tl) * zoom, capScreen),
        tr: Math.min(Math.max(0, cornerRadii.tr) * zoom, capScreen),
        br: Math.min(Math.max(0, cornerRadii.br) * zoom, capScreen),
        bl: Math.min(Math.max(0, cornerRadii.bl) * zoom, capScreen),
      }
    : null;
  const perCornerPathD = screenRadii ? perCornerRectPath(rectW, rectH, screenRadii) : null;

  const rectFillProps: SVGAttributes<SVGRectElement> = { fill: fill ? fill.value : "transparent" };
  const rectStrokeProps: SVGAttributes<SVGRectElement> = svgStrokeToReactProps(strokeAttrs);

  /** The rounded frame box — a per-corner `<path>` when `cornerRadii` is set,
   *  else the uniform `<rect rx/ry>`. Same fill/stroke props feed either. */
  const RoundedBox = (props: SVGAttributes<SVGElement>): JSX.Element =>
    perCornerPathD !== null ? (
      <path transform={`translate(${inset} ${inset})`} d={perCornerPathD} {...props} />
    ) : (
      <rect x={inset} y={inset} width={rectW} height={rectH} rx={rx} ry={ry} {...props} />
    );

  // Only mount the SVG overlay when a paint unit exists — a frame with no
  // fill / stroke stays a plain transparent div (keeps the DOM minimal).
  const hasUnitPaint = fill !== null || strokeAttrs !== null;

  return (
    <div
      ref={containerRef}
      data-testid="frame-block"
      data-frame-kind="frame"
      className="absolute inset-0 pointer-events-none"
    >
      {hasUnitPaint ? (
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
            {/* Video-fill clip — the frame rect (rounded) clips the <video>
                rendered below, so a video background respects cornerRadius. */}
            {fill?.videoFill ? (
              <clipPath id={`${uid}-video-clip`} clipPathUnits="userSpaceOnUse">
                <RoundedBox fill="black" />
              </clipPath>
            ) : null}
          </defs>
          <RoundedBox {...rectFillProps} {...rectStrokeProps} />
          {/* Video fill — a foreignObject-hosted <video> clipped to the frame
              rect. Autoplays muted by default (Figma default + browser policy).
              Same mechanism shapes use, so the agent's image/video fill paints
              land identically on a frame. */}
          {fill?.videoFill ? (
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
      ) : null}
    </div>
  );
}
