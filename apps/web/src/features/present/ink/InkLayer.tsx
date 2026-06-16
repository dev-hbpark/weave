// WI-239 Phase 1 — the ink surface: a coordinate-agnostic capture + render
// layer. Used twice:
//   • slide overlay — sized to the design, mounted inside Stage's design
//     plane, so its coordinate space is design pixels and it tracks the
//     camera (zoom/pan) for free.
//   • blank board   — sized to the viewport, mounted screen-space.
//
// It is a thin view over `useInkCapture` (input) + the session (state). The
// SVG is `pointer-events: none`; only the wrapper captures, so a finished
// stroke never blocks the eraser's hit test, and `enabled === false` makes
// the whole layer transparent to pointers (present nav untouched).

import { useMemo } from "react";
import type { InkTool } from "./ink-tools.js";
import type { InkStroke, InkStrokeStyle, InkSurfaceKey } from "./types.js";
import { useInkCapture } from "./use-ink-capture.js";
import type { InkSession } from "./use-ink-session.js";

interface InkLayerProps {
  readonly width: number;
  readonly height: number;
  readonly surfaceKey: InkSurfaceKey;
  readonly tool: InkTool;
  readonly style: InkStrokeStyle;
  readonly session: InkSession;
  /** When false the layer is `pointer-events: none` — present mode behaves
   *  exactly as without ink. */
  readonly enabled: boolean;
}

export function InkLayer({
  width,
  height,
  surfaceKey,
  tool,
  style,
  session,
  enabled,
}: InkLayerProps) {
  const { handlers, draft } = useInkCapture({
    tool,
    style,
    onCommitStroke: (s) => session.addStroke(surfaceKey, s),
    onErase: (at) => session.eraseAt(surfaceKey, at),
  });
  const strokes = session.strokes(surfaceKey);

  return (
    <div
      data-ink-layer={surfaceKey}
      data-ink-enabled={enabled ? "true" : "false"}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: enabled ? "auto" : "none",
        cursor: enabled ? "crosshair" : undefined,
        touchAction: "none",
      }}
      {...(enabled ? handlers : {})}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        aria-hidden="true"
      >
        {strokes.map((s) => (
          <StrokePath key={s.id} stroke={s} />
        ))}
        {draft !== null ? <StrokePath stroke={draft} /> : null}
      </svg>
    </div>
  );
}

function pathFrom(points: InkStroke["points"]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (first === undefined) return "";
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

function StrokePath({ stroke }: { readonly stroke: InkStroke }) {
  const d = useMemo(() => pathFrom(stroke.points), [stroke.points]);
  const blend = stroke.style.blend === "multiply" ? "multiply" : undefined;
  // A single-point stroke (a tap) has no segment to stroke — draw a dot so
  // the mark is still visible.
  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    if (p === undefined) return null;
    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={stroke.style.width / 2}
        fill={stroke.style.color}
        opacity={stroke.style.opacity}
        style={blend ? { mixBlendMode: blend } : undefined}
      />
    );
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke.style.color}
      strokeWidth={stroke.style.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={stroke.style.opacity}
      style={blend ? { mixBlendMode: blend } : undefined}
    />
  );
}
