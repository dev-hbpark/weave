// WI-058 — QrBlock renderer. Generates the QR module matrix from `attrs.data`
// (weave-local Nayuki encoder) and draws it as a single SVG <path> (square /
// dot / rounded modules), with foreground + background via `paintToSvgFill`
// (solid OR gradient — reuses the shape fill machinery). The QR is kept SQUARE
// (preserveAspectRatio) so it stays scannable inside a non-square frame.

import { type PaintSpec, paintToSvgFill } from "@agocraft/core";
import { type SVGAttributes, useId } from "react";
import { qrMatrix } from "../qr/qr-matrix.js";
import type { AgoItem, QrAttrs } from "../types.js";

interface QrBlockProps {
  readonly item: AgoItem<"qr">;
  readonly onUpdate?: (patch: Partial<QrAttrs>) => void;
}

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
    const row = matrix[y]!;
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

function GradientDefs({
  defs,
}: {
  defs: ReturnType<typeof paintToSvgFill>["defs"];
}): JSX.Element | null {
  if (!defs) return null;
  if (defs.type === "linear") {
    return (
      <linearGradient
        id={defs.id}
        gradientTransform={defs.angle !== undefined ? `rotate(${defs.angle} 0.5 0.5)` : undefined}
      >
        {defs.stops.map((st, i) => (
          <stop key={i} offset={`${st.offset * 100}%`} stopColor={st.color} />
        ))}
      </linearGradient>
    );
  }
  if (defs.type === "radial") {
    return (
      <radialGradient id={defs.id} cx={defs.cx} cy={defs.cy} r={0.5}>
        {defs.stops.map((st, i) => (
          <stop key={i} offset={`${st.offset * 100}%`} stopColor={st.color} />
        ))}
      </radialGradient>
    );
  }
  return null;
}

export function QrBlock({ item }: QrBlockProps): JSX.Element {
  const uid = useId();
  const a = item.attrs;
  const ecLevel = a.ecLevel ?? "M";
  const margin = a.margin ?? 4;
  const style = a.moduleStyle ?? "square";
  const matrix = qrMatrix(a.data, ecLevel);

  if (matrix === null) {
    // Empty / un-encodable data → placeholder.
    return (
      <div
        data-testid="qr-block"
        data-qr-empty="true"
        className="absolute inset-0 grid place-items-center rounded-[var(--radius-sm)] border border-dashed border-[color:var(--surface-2-border)] text-[color:var(--text-soft)]"
        style={{ opacity: a.opacity ?? 1 }}
      >
        <span className="text-[11px]">QR — set data</span>
      </div>
    );
  }

  const total = matrix.length + margin * 2;
  const fgId = `${uid}-qr-fg`;
  const bgId = `${uid}-qr-bg`;
  const fg = paintToSvgFill(a.foreground ?? DEFAULT_FG, fgId);
  const bgPaint = a.background === null ? null : (a.background ?? DEFAULT_BG);
  const bg = bgPaint ? paintToSvgFill(bgPaint, bgId) : null;
  const d = modulesPath(matrix, margin, style);

  const fgProps: SVGAttributes<SVGPathElement> = { fill: fg.value };

  return (
    <div
      data-testid="qr-block"
      data-qr-modules={matrix.length}
      className="absolute inset-0"
      style={{ opacity: a.opacity ?? 1 }}
    >
      <svg
        viewBox={`0 0 ${total} ${total}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        aria-label="QR code"
        style={{ display: "block" }}
      >
        <defs>
          <GradientDefs defs={fg.defs} />
          {bg ? <GradientDefs defs={bg.defs} /> : null}
        </defs>
        {bg ? <rect x={0} y={0} width={total} height={total} fill={bg.value} /> : null}
        <path
          d={d}
          {...fgProps}
          shapeRendering={style === "square" ? "crispEdges" : "geometricPrecision"}
        />
      </svg>
    </div>
  );
}
