// WI-070 — renders the active snap's guide geometry as a screen-space overlay.
// Reads the transient `snapFeedback` store (a `SnapResult`) and draws each guide
// in CLIENT px (the space the drag consumer resolves snaps in), portal'd to
// <body> as a `fixed inset-0`, pointer-events:none SVG — same pattern as
// PresenceCursors. Phase 1 emits only `point` guides (endpoint-close); the
// `vline`/`hline` branches render alignment guides unchanged once Phase 2
// providers (item edges, equal spacing, grid) start emitting them.

import { createPortal } from "react-dom";
import { useSnapFeedback } from "./snap-feedback.js";

const ACCENT = "var(--accent, #4f46e5)";

export function SnapFeedbackLayer(): JSX.Element | null {
  const result = useSnapFeedback();
  if (typeof document === "undefined" || result === null || result.guides.length === 0) {
    return null;
  }
  return createPortal(
    <svg
      aria-hidden="true"
      role="presentation"
      className="pointer-events-none fixed inset-0 z-[47]"
      style={{ width: "100vw", height: "100vh", overflow: "visible" }}
      data-testid="snap-feedback"
    >
      <title>Snap guides</title>
      {result.guides.map((g) => {
        if (g.kind === "point") {
          return (
            <g key={`point:${g.at.x},${g.at.y}`} data-snap-guide="point">
              <circle cx={g.at.x} cy={g.at.y} r={7} fill="none" stroke={ACCENT} strokeWidth={2} />
              <circle cx={g.at.x} cy={g.at.y} r={2.5} fill={ACCENT} />
            </g>
          );
        }
        if (g.kind === "vline") {
          return (
            <line
              key={`vline:${g.x}`}
              data-snap-guide="vline"
              x1={g.x}
              y1={g.from}
              x2={g.x}
              y2={g.to}
              stroke={ACCENT}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        }
        return (
          <line
            key={`hline:${g.y}`}
            data-snap-guide="hline"
            x1={g.from}
            y1={g.y}
            x2={g.to}
            y2={g.y}
            stroke={ACCENT}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
    </svg>,
    document.body,
  );
}
