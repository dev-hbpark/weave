// WI-032 + WI-243 / DR-160 — frame content ViewModel (per-item, content surface).
//
// A frame paints only its container chrome — background fill + border stroke +
// corner radius — via the SAME `paintToSvgFill` / `strokeToSvgAttrs` machinery
// shapes use (so gradient/image/video fills render identically). This VM owns the
// paint resolution (fill/stroke decoration units → resolved colors, SvgFill
// results), the rect fill/stroke prop bundles, `hasUnitPaint`, and the video clip
// id. The container box + the UNSCALED design box are DOM measurements the View
// owns (ResizeObserver); the VM stays DOM-less and exposes `geometryFor(bbox,
// designBox)` — a pure projector for the rounded-rect geometry. So the View binds
// to `{ vm }` only while DOM measurement stays in the View.

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
import { type SVGAttributes, useId } from "react";
import { type CornerRadii, cornerRadiusPxToFraction, perCornerRectPath } from "../corner-radius.js";
import { useResolveColor } from "../style/resolver-context.js";
import type { AgoItem } from "../types.js";
import { svgStrokeToReactProps } from "./svg-stroke-props.js";

export type FrameFill = ReturnType<typeof paintToSvgFill>;

/** Box geometry projected for a measured (screen) box + (unscaled) design box. */
export interface FrameBoxGeom {
  readonly inset: number;
  readonly rectW: number;
  readonly rectH: number;
  readonly rx: number | undefined;
  readonly ry: number | undefined;
  readonly perCornerPathD: string | null;
}

export interface FrameItemVm {
  /** Only mount the SVG overlay when a paint unit exists (a plain frame stays a
   *  transparent div — minimal DOM). */
  readonly hasUnitPaint: boolean;
  readonly fill: FrameFill | null;
  readonly strokeFill: FrameFill | null;
  readonly rectFillProps: SVGAttributes<SVGRectElement>;
  readonly rectStrokeProps: SVGAttributes<SVGRectElement>;
  readonly videoClipId: string;
  /** Pure projector — the View measures its screen box + unscaled design box
   *  (DOM) and asks for the rounded-rect geometry. */
  readonly geometryFor: (
    bbox: { width: number; height: number },
    designBox: { width: number; height: number },
  ) => FrameBoxGeom;
}

export function useFrameItemViewModel(item: AgoItem<"frame">): FrameItemVm {
  const itemRef = item as unknown as AgocraftItem;
  const uid = useId();
  const { cornerRadius } = item.attrs;
  const cornerRadii = (item.attrs as { cornerRadii?: CornerRadii }).cornerRadii;

  // DR-028 — fill / stroke are decoration UNITS.
  const fillUnit = findUnitInItem(itemRef, FILL_UNIT_KIND)?.attrs as PaintSpec | undefined;
  const strokeUnit = findUnitInItem(itemRef, STROKE_UNIT_KIND)?.attrs as StrokeSpec | undefined;
  // WI-040 — resolve StyleRef tokens → CSS strings for the solid-color fields.
  // Hooks run unconditionally regardless of paint type.
  const fillSolidRaw =
    fillUnit?.type === "solid" ? (fillUnit as { color?: unknown }).color : undefined;
  const resolvedFillSolid = useResolveColor(fillSolidRaw, itemRef, undefined);
  const strokeSolidRaw =
    strokeUnit?.paint.type === "solid"
      ? (strokeUnit.paint as { color?: unknown }).color
      : undefined;
  const resolvedStrokeSolid = useResolveColor(strokeSolidRaw, itemRef, undefined);

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

  const sw = resolvedStroke?.width ?? 0;
  const rectFillProps: SVGAttributes<SVGRectElement> = { fill: fill ? fill.value : "transparent" };
  const rectStrokeProps: SVGAttributes<SVGRectElement> = svgStrokeToReactProps(strokeAttrs);
  const hasUnitPaint = fill !== null || strokeAttrs !== null;

  // Stroke is centered on the rect edge — inset by half its width so the whole
  // border sits inside the frame box (Figma "inside" border). Corner radius is an
  // absolute design-px value, projected to screen-px via the uniform zoom and
  // clamped to the half-short side so curvature is identical on both axes.
  const geometryFor = (
    bbox: { width: number; height: number },
    designBox: { width: number; height: number },
  ): FrameBoxGeom => {
    const inset = sw / 2;
    const rectW = Math.max(0, bbox.width - sw);
    const rectH = Math.max(0, bbox.height - sw);
    const radius =
      cornerRadius !== undefined && cornerRadius > 0
        ? cornerRadiusPxToFraction(cornerRadius, designBox.width, designBox.height) *
          (Math.min(rectW, rectH) / 2)
        : undefined;
    // WI-109 — per-corner override: drawn as an SVG path (a <rect> carries one
    // rx/ry). Each corner's design-px radius projects via zoom, clamped so the
    // four arcs never overlap.
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
    return { inset, rectW, rectH, rx: radius, ry: radius, perCornerPathD };
  };

  return {
    hasUnitPaint,
    fill,
    strokeFill,
    rectFillProps,
    rectStrokeProps,
    videoClipId: `${uid}-video-clip`,
    geometryFor,
  };
}
