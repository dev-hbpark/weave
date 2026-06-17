// WI-058 + WI-243 / DR-160 — qr content ViewModel (per-item, content surface).
//
// Generates the QR module matrix from `attrs.data` (weave-local Nayuki encoder),
// builds the union <path> of dark modules (square / dot / rounded), resolves the
// foreground + background paints (`paintToSvgFill` — solid or gradient), and
// computes the optional centre-logo geometry. Empty / un-encodable data → an
// `empty` status; the View renders a placeholder. DOM-less (fixed viewBox) →
// `renderHook`-testable. The View binds to `{ vm }` only.

import { type PaintSpec, paintToSvgFill } from "@agocraft/core";
import { type SVGAttributes, useId } from "react";
import { nn } from "../../lib/nn.js";
import { clampLogoScale, effectiveQrEcLevel } from "../qr/qr-logo.js";
import { qrLogoIcon } from "../qr/qr-logo-icons.js";
import { qrMatrix } from "../qr/qr-matrix.js";
import type { AgoItem, QrAttrs } from "../types.js";

export type QrFill = ReturnType<typeof paintToSvgFill>;
type QrLogoIcon = NonNullable<ReturnType<typeof qrLogoIcon>>["Icon"];

const DEFAULT_FG: PaintSpec = { type: "solid", color: "#111827" };
const DEFAULT_BG: PaintSpec = { type: "solid", color: "#ffffff" };

function f(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

/** Union path of all dark modules, offset by the quiet-zone `margin`. */
function modulesPath(
  matrix: ReadonlyArray<ReadonlyArray<boolean>>,
  margin: number,
  style: NonNullable<QrAttrs["moduleStyle"]>,
): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.length; y++) {
    const row = nn(matrix[y]);
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const px = x + margin;
      const py = y + margin;
      if (style === "square") {
        parts.push(`M${px} ${py}h1v1h-1z`);
      } else if (style === "dot") {
        const r = 0.45;
        const cx = px + 0.5;
        const cy = py + 0.5;
        parts.push(
          `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0z`,
        );
      } else {
        // rounded
        const r = 0.35;
        const s = 1 - 2 * r;
        parts.push(
          `M${f(px + r)} ${py}h${f(s)}a${r} ${r} 0 0 1 ${r} ${r}v${f(s)}a${r} ${r} 0 0 1 ${-r} ${r}h${f(-s)}a${r} ${r} 0 0 1 ${-r} ${-r}v${f(-s)}a${r} ${r} 0 0 1 ${r} ${-r}z`,
        );
      }
    }
  }
  return parts.join("");
}

export interface QrLogoVm {
  readonly Icon: QrLogoIcon;
  readonly side: number;
  readonly knockSide: number;
  readonly centre: number;
  readonly knockFill: string;
  readonly strokeColor: string;
}

export type QrItemVm =
  | { readonly status: "empty"; readonly opacity: number }
  | {
      readonly status: "ready";
      readonly opacity: number;
      readonly total: number;
      readonly modulesCount: number;
      readonly logoId: string | undefined;
      readonly fg: QrFill;
      readonly bg: QrFill | null;
      readonly pathD: string;
      readonly fgProps: SVGAttributes<SVGPathElement>;
      readonly shapeRendering: "crispEdges" | "geometricPrecision";
      readonly logo: QrLogoVm | null;
    };

export function useQrItemViewModel(item: AgoItem<"qr">): QrItemVm {
  const uid = useId();
  const a = item.attrs;
  const opacity = a.opacity ?? 1;
  // WI-140 — a logo covers centre modules, so encode at EC ≥ Q.
  const ecLevel = effectiveQrEcLevel(a);
  const margin = a.margin ?? 4;
  const style = a.moduleStyle ?? "square";
  const matrix = qrMatrix(a.data, ecLevel);

  if (matrix === null) return { status: "empty", opacity };

  const total = matrix.length + margin * 2;
  const fg = paintToSvgFill(a.foreground ?? DEFAULT_FG, `${uid}-qr-fg`);
  const bgPaint = a.background === null ? null : (a.background ?? DEFAULT_BG);
  const bg = bgPaint ? paintToSvgFill(bgPaint, `${uid}-qr-bg`) : null;
  const pathD = modulesPath(matrix, margin, style);
  const fgProps: SVGAttributes<SVGPathElement> = { fill: fg.value };

  // WI-140 — centre logo overlay: a knockout (quiet-patch) rect in the background
  // colour separates the glyph from the modules; the icon draws on top.
  const logoEntry = qrLogoIcon(a.logo?.iconId);
  let logo: QrLogoVm | null = null;
  if (logoEntry && a.logo) {
    const side = clampLogoScale(a.logo.scale) * matrix.length;
    const pad = a.logo.padding ?? 0.5;
    const knockSide = side + pad * 2;
    logo = {
      Icon: logoEntry.Icon,
      side,
      knockSide,
      centre: total / 2,
      knockFill: bg ? bg.value : "#ffffff",
      strokeColor: fg.value,
    };
  }

  return {
    status: "ready",
    opacity,
    total,
    modulesCount: matrix.length,
    logoId: logoEntry ? logoEntry.id : undefined,
    fg,
    bg,
    pathD,
    fgProps,
    shapeRendering: style === "square" ? "crispEdges" : "geometricPrecision",
    logo,
  };
}
