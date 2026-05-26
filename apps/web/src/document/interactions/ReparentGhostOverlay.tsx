// WI-039 — Cursor-following ghost overlay for the reparent drag gesture.
//
// Renders only when `state.active === true`. The visual is intentionally
// minimal in v1 (a single chip with the item count + valid/invalid
// affordance) — frame-thumbnail previews and per-item outline ghosts
// land in DR-design-013's TreePicker / ThumbnailDropTarget primitives.
//
// Pointer-events:none everywhere — the overlay must not capture the
// `pointermove` / `pointerup` listeners the controller installs at
// window level.

import type { ReparentDragState } from "./use-reparent-drag-controller.js";

export function ReparentGhostOverlay({
  state,
}: {
  readonly state: ReparentDragState;
}) {
  if (!state.active || state.cursor === null) return null;
  const valid = state.hoveredTarget?.valid ?? false;
  const hasTarget = state.hoveredTarget !== null;
  const label = `${state.entries.length} item${state.entries.length === 1 ? "" : "s"}`;
  const verdict = !hasTarget
    ? "이동 위치 선택"
    : valid
      ? "여기로 이동"
      : "이동 불가";
  return (
    <div
      data-reparent-ghost
      data-reparent-ghost-state={
        !hasTarget ? "pending" : valid ? "valid" : "invalid"
      }
      style={{
        position: "fixed",
        left: state.cursor.x + 14,
        top: state.cursor.y + 14,
        pointerEvents: "none",
        zIndex: 9999,
        padding: "6px 10px",
        borderRadius: 8,
        background: !hasTarget
          ? "rgba(20, 20, 24, 0.85)"
          : valid
            ? "rgba(34, 134, 64, 0.92)"
            : "rgba(168, 41, 41, 0.92)",
        color: "white",
        font: "500 12px/1.2 system-ui, -apple-system, sans-serif",
        letterSpacing: 0.2,
        boxShadow:
          "0 6px 24px rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.18)",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: 0.82, marginRight: 6 }}>{label}</span>
      <span>{verdict}</span>
    </div>
  );
}
