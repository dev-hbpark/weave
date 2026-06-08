// agocraft's `strokeToSvgAttrs` returns SVG PRESENTATION-attribute keys (kebab:
// `stroke-width`, `stroke-dasharray`, `stroke-linecap`, `stroke-linejoin`). Those
// are valid in raw SVG / serialization, but React's JSX wants camelCase props on
// a <rect>/<path> — spreading the kebab shape directly triggers React's
// "Invalid DOM property `stroke-width`. Did you mean `strokeWidth`?" warning.
//
// This converter maps the kebab shape to React SVG props once, so FrameBlock /
// ShapeBlock / LineBlock can spread the result without warnings.

import type { SvgStrokeAttrs } from "@agocraft/core";
import type { SVGAttributes } from "react";

type ReactStrokeProps = Pick<
  SVGAttributes<SVGElement>,
  "stroke" | "strokeWidth" | "strokeDasharray" | "strokeLinecap" | "strokeLinejoin"
>;

/** Convert agocraft `SvgStrokeAttrs` (kebab) → React SVG props (camelCase).
 *  `null` / `undefined` → `{}`. */
export function svgStrokeToReactProps(s: SvgStrokeAttrs | null | undefined): ReactStrokeProps {
  if (s == null) return {};
  return {
    stroke: s.stroke,
    strokeWidth: s["stroke-width"],
    ...(s["stroke-dasharray"] !== undefined ? { strokeDasharray: s["stroke-dasharray"] } : {}),
    ...(s["stroke-linecap"] !== undefined
      ? { strokeLinecap: s["stroke-linecap"] as ReactStrokeProps["strokeLinecap"] }
      : {}),
    ...(s["stroke-linejoin"] !== undefined
      ? { strokeLinejoin: s["stroke-linejoin"] as ReactStrokeProps["strokeLinejoin"] }
      : {}),
  };
}
