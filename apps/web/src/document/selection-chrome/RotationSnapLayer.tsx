// WI-074 — draws the rotation snap guide: when the rotate handle locks to a
// cardinal (0/90/180/270), an axis crosshair through the item center (in the
// snapped orientation) + a degree badge. Reads the transient
// `rotationSnapFeedback` store; portal'd to <body> as a fixed, pointer-events:none
// SVG — same pattern as SnapFeedbackLayer.

import { createPortal } from "react-dom";
import { useRotationSnap } from "./rotation-snap-feedback.js";

const ACCENT = "var(--accent, #4f46e5)";
const LEN = 4000;

export function RotationSnapLayer(): JSX.Element | null {
  const snap = useRotationSnap();
  if (typeof document === "undefined" || snap === null) return null;

  const { cx, cy, rad, deg } = snap;
  // Two lines through (cx, cy): the item's local x-axis (rad) and y-axis (rad+90°).
  const axis = (theta: number): { x1: number; y1: number; x2: number; y2: number } => ({
    x1: cx - LEN * Math.cos(theta),
    y1: cy - LEN * Math.sin(theta),
    x2: cx + LEN * Math.cos(theta),
    y2: cy + LEN * Math.sin(theta),
  });
  const a = axis(rad);
  const b = axis(rad + Math.PI / 2);

  return createPortal(
    <svg
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none fixed inset-0 z-[47]"
      style={{ width: "100vw", height: "100vh", overflow: "visible" }}
      data-testid="rotation-snap-guide"
      data-snap-deg={deg}
    >
      <title>Rotation snap</title>
      <line {...a} stroke={ACCENT} strokeWidth={1} strokeDasharray="4 4" />
      <line {...b} stroke={ACCENT} strokeWidth={1} strokeDasharray="4 4" />
      <g transform={`translate(${cx + 14}, ${cy - 14})`}>
        <rect x={0} y={-13} width={40} height={18} rx={4} fill={ACCENT} />
        <text x={20} y={0} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
          {deg}°
        </text>
      </g>
    </svg>,
    document.body,
  );
}
